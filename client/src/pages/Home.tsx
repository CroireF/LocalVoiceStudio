import { trpc } from "@/lib/trpc";
import {
  AudioLines,
  Bot,
  CircleDot,
  Download,
  FolderClock,
  Gauge,
  Headphones,
  HeartPulse,
  Languages,
  Lightbulb,
  Menu,
  Mic2,
  Music2,
  Pause,
  Play,
  Radio,
  SlidersHorizontal,
  Sparkles,
  Square,
  WandSparkles,
  Waves,
  X,
} from "lucide-react";
import React, { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  CLONE_ENGINE_OPTIONS,
  DEFAULT_SCRIPT,
  DEFAULT_VOICE,
  createAutoPreviewSequencer,
  isLatestPreviewRequest,
  LANGUAGE_OPTIONS,
  prepareBatchJobs,
  STYLE_PRESETS,
  VOICE_CATALOG,
  type AudioFormat,
  type CloneEngine,
  type HummingEngine,
  type StudioLanguage,
  type VoiceGender,
  type VoiceStyle,
} from "@shared/voice";

type StudioMode = "voice-welcome" | "voice-batch" | "voice-live" | "voice-clone" | "humming-welcome" | "humming-random" | "humming-guided";

const STUDIO_ROUTES: Record<StudioMode, string> = {
  "voice-welcome": "/create-voice",
  "voice-batch": "/create-voice/batch",
  "voice-live": "/create-voice/live-preview",
  "voice-clone": "/create-voice/clone",
  "humming-welcome": "/create-humming",
  "humming-random": "/create-humming/text-hum",
  "humming-guided": "/create-humming/melody-guided",
};

const MODE_BY_ROUTE = Object.fromEntries(Object.entries(STUDIO_ROUTES).map(([mode, route]) => [route, mode])) as Record<string, StudioMode>;

type RenderEntry = {
  id: string;
  text: string;
  label: string;
  language: StudioLanguage;
  gender: VoiceGender;
  voiceId: string;
  style: VoiceStyle;
  duration: number;
  audioUrl: string;
  downloads: Record<AudioFormat, string>;
  createdAt: number;
};

const BATCH_HISTORY_STORAGE_KEY = "voicestudio-local-history";
const DEFAULT_ENGLISH_PREVIEW_TEXT = DEFAULT_SCRIPT.english;

function readBatchHistory(): RenderEntry[] {
  try {
    const saved = window.localStorage.getItem(BATCH_HISTORY_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as RenderEntry[]) : [];
  } catch {
    return [];
  }
}

function formatHistoryDate(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }).format(timestamp);
}

const VOICE_MODES: Array<{ id: StudioMode; label: string; detail: string; icon: typeof AudioLines }> = [
  { id: "voice-batch", label: "Batch text", detail: "Script to voice", icon: AudioLines },
  { id: "voice-live", label: "Live preview", detail: "Speak while typing", icon: Radio },
  { id: "voice-clone", label: "Voice clone", detail: "Record a local profile", icon: Mic2 },
];

const HUMMING_MODES: Array<{ id: StudioMode; label: string; detail: string; icon: typeof Music2 }> = [
  { id: "humming-random", label: "Random melody", detail: "Text-guided hum", icon: Music2 },
  { id: "humming-guided", label: "Melody guided", detail: "Hum a contour", icon: Waves },
];

function formatTime(seconds: number) {
  const value = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  return `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, "0")}`;
}

function formatLabel(format: AudioFormat) {
  return format.toUpperCase();
}

function estimatePitch(samples: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let index = 0; index < samples.length; index += 1) rms += samples[index]! ** 2;
  if (Math.sqrt(rms / samples.length) < 0.012) return 0;
  const minimumLag = Math.floor(sampleRate / 480);
  const maximumLag = Math.min(Math.floor(sampleRate / 75), samples.length - 1);
  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let score = 0;
    for (let index = 0; index < samples.length - lag; index += 1) score += samples[index]! * samples[index + lag]!;
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  return bestLag ? sampleRate / bestLag : 0;
}

async function extractPitchContour(recordingUrl: string, baseFrequency: number) {
  const context = new AudioContext();
  try {
    const bytes = await fetch(recordingUrl).then(response => response.arrayBuffer());
    const audio = await context.decodeAudioData(bytes);
    const channel = audio.getChannelData(0);
    const frameSize = 2048;
    const step = Math.max(frameSize, Math.floor(channel.length / 16));
    const contour: number[] = [];
    for (let start = 0; start + frameSize < channel.length && contour.length < 16; start += step) {
      const frequency = estimatePitch(channel.slice(start, start + frameSize), audio.sampleRate);
      if (frequency > 0) contour.push(Math.max(-24, Math.min(24, Math.round(12 * Math.log2(frequency / baseFrequency)))));
    }
    return contour.length ? contour : [0, 2, 4, 2, 0];
  } finally {
    await context.close();
  }
}

function readDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Unable to read the local recording."));
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the local recording."));
    reader.readAsDataURL(blob);
  });
}

function ParameterSlider({
  label,
  value,
  min,
  max,
  step,
  valueLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  const fill = `${((value - min) / (max - min)) * 100}%`;
  return (
    <label className="rounded-xl border border-white/[0.07] bg-white/[0.025] px-3.5 py-3">
      <span className="mb-3 flex items-center justify-between gap-3 text-xs">
        <span className="font-medium text-slate-300">{label}</span>
        <span className="font-mono text-[11px] font-medium text-cyan-200">{valueLabel}</span>
      </span>
      <input
        aria-label={label}
        className="control-range"
        style={{ "--fill": fill } as React.CSSProperties}
        max={max}
        min={min}
        step={step}
        type="range"
        value={value}
        onChange={event => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function WelcomePanel({
  eyebrow,
  title,
  description,
  cards,
  actionLabel,
  onAction,
  kind,
}: {
  eyebrow: string;
  title: string;
  description: string;
  cards: Array<{ title: string; body: string; icon: ReactNode; actionLabel: string; mode: StudioMode }>;
  actionLabel: string;
  onAction: (mode: StudioMode) => void;
  kind: "voice" | "humming";
}) {
  return (
    <section className="mode-welcome glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-9">
      <div className={`mode-orbit ${kind === "humming" ? "mode-orbit-amber" : ""}`}>
        <span className="mode-orbit-node mode-orbit-node-one" />
        <span className="mode-orbit-node mode-orbit-node-two" />
        <span className="mode-orbit-node mode-orbit-node-three" />
      </div>
      <div className="relative z-10 grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
        <div>
          <div className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-cyan-300">
            <Sparkles className="h-3.5 w-3.5" /> {eyebrow}
          </div>
          <h1 className="max-w-xl text-4xl font-extrabold tracking-[-0.055em] text-white sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{description}</p>
          <div className="mt-10 grid max-w-xl grid-cols-3 gap-3 border-t border-white/[0.08] pt-5 text-xs text-slate-400"><div><p className="font-mono text-cyan-200">13</p><p className="mt-1">Languages</p></div><div><p className="font-mono text-cyan-200">03</p><p className="mt-1">Voice paths</p></div><div><p className="font-mono text-cyan-200">100%</p><p className="mt-1">Local exports</p></div></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
          {cards.map(card => (
            <div key={card.title} className="rounded-2xl border border-white/[0.1] bg-[#090c12]/70 p-4 backdrop-blur-sm">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-xl bg-cyan-300/[0.12] text-cyan-200">{card.icon}</div>
              <p className="text-sm font-bold text-slate-100">{card.title}</p>
              <p className="mt-1.5 text-xs leading-5 text-slate-500">{card.body}</p>
              <button type="button" onClick={() => onAction(card.mode)} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-200 via-cyan-300 to-teal-300 px-4 text-sm font-extrabold text-slate-950 transition hover:brightness-105 active:scale-[0.98]"><span className="grid h-4 w-4 place-items-center">{card.icon}</span> {card.actionLabel}</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionNav({
  title,
  active,
  rootMode,
  children,
  onSelect,
}: {
  title: string;
  active: StudioMode;
  rootMode: StudioMode;
  children: Array<{ id: StudioMode; label: string; detail: string; icon: typeof AudioLines }>;
  onSelect: (mode: StudioMode) => void;
}) {
  const rootActive = active === rootMode;
  return (
    <div className="space-y-1.5">
      <button type="button" onClick={() => onSelect(rootMode)} className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-semibold transition ${rootActive ? "bg-cyan-300/[0.12] text-cyan-100 ring-1 ring-inset ring-cyan-300/[0.12]" : "text-slate-300 hover:bg-white/[0.045]"}`}>
        {title === "Create voice" ? <AudioLines className="h-4 w-4" /> : <WandSparkles className="h-4 w-4" />} {title}
      </button>
      <div className="ml-4 space-y-1 border-l border-white/[0.08] pl-3">
        {children.map(item => {
          const Icon = item.icon;
          return (
            <button type="button" key={item.id} onClick={() => onSelect(item.id)} className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${active === item.id ? "bg-white/[0.08] text-white" : "text-slate-500 hover:bg-white/[0.04] hover:text-slate-300"}`}>
              <Icon className="h-3.5 w-3.5" />
              <span><span className="block text-[11px] font-semibold">{item.label}</span><span className="block text-[9px] text-slate-600">{item.detail}</span></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Home() {
  const [location, setLocation] = useLocation();
  const mode = MODE_BY_ROUTE[location] ?? "voice-batch";
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [language, setLanguage] = useState<StudioLanguage>("english");
  const [gender, setGender] = useState<VoiceGender>("female");
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE.english.female);
  const [script, setScript] = useState(DEFAULT_SCRIPT.english);
  const [lineBreakOutput, setLineBreakOutput] = useState(false);
  const [style, setStyle] = useState<VoiceStyle>("news");
  const [rate, setRate] = useState(0.98);
  const [pitch, setPitch] = useState(0);
  const [volume, setVolume] = useState(100);
  const [pause, setPause] = useState(0.28);
  const [exportFormat, setExportFormat] = useState<AudioFormat>("mp3");
  const [renders, setRenders] = useState<RenderEntry[]>([]);
  const [batchHistory, setBatchHistory] = useState<RenderEntry[]>(readBatchHistory);
  const [performancePreviewRevision, setPerformancePreviewRevision] = useState(0);
  const [activeRenderId, setActiveRenderId] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [liveText, setLiveText] = useState("Type here and VoiceStudio will read a local preview after a short pause.");
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [liveCache, setLiveCache] = useState<string[]>([]);
  const [cloneConsent, setCloneConsent] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [cloneProfileId, setCloneProfileId] = useState<string | null>(null);
  const [cloneText, setCloneText] = useState("This is my local VoiceStudio reference. I confirm that I have permission to use this voice.");
  const [cloneTargetText, setCloneTargetText] = useState("Write a new sentence here to render with the local reference profile.");
  const [cloneEngine, setCloneEngine] = useState<CloneEngine>("xtts-v2");
  const [hummingText, setHummingText] = useState("A bright morning carries a gentle melody.");
  const [hummingMood, setHummingMood] = useState("Hopeful");
  const [hummingBpm, setHummingBpm] = useState(92);
  const [hummingStyle, setHummingStyle] = useState("Ambient");
  const [hummingGender, setHummingGender] = useState<VoiceGender>("female");
  const [hummingFrequency, setHummingFrequency] = useState(220);
  const [hummingPitch, setHummingPitch] = useState(0);
  const [hummingVolume, setHummingVolume] = useState(85);
  const [hummingEngine, setHummingEngine] = useState<HummingEngine>("local-hum");
  const [guideRecording, setGuideRecording] = useState<string | null>(null);
  const [guideContour, setGuideContour] = useState<number[]>([]);
  const [isGuideRecording, setIsGuideRecording] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoPreviewSequencerRef = useRef(createAutoPreviewSequencer());
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const guideRecorderRef = useRef<MediaRecorder | null>(null);

  const voiceOptions = VOICE_CATALOG[language][gender];
  const activeVoice = useMemo(() => voiceOptions.find(voice => voice.id === voiceId) ?? voiceOptions[0], [voiceId, voiceOptions]);
  const languageLabel = LANGUAGE_OPTIONS.find(option => option.id === language)?.label ?? "English";

  const generation = trpc.voice.generate.useMutation();
  const autoBatchPreview = trpc.voice.generate.useMutation();
  const hummingGeneration = trpc.humming.generate.useMutation();
  const cloneCapture = trpc.clone.captureReference.useMutation();
  const cloneGeneration = trpc.clone.generate.useMutation();

  const selectMode = (nextMode: StudioMode) => {
    setLocation(STUDIO_ROUTES[nextMode]);
    setIsMenuOpen(false);
  };

  useEffect(() => {
    setVoiceId(DEFAULT_VOICE[language][gender]);
  }, [language, gender]);

  useEffect(() => {
    if (!liveEnabled || mode !== "voice-live" || !liveText.trim() || !("speechSynthesis" in window)) return;
    const timer = window.setTimeout(() => {
      window.speechSynthesis.cancel();
      const speech = new SpeechSynthesisUtterance(liveText.trim());
      const locale = LANGUAGE_OPTIONS.find(item => item.id === language)?.locale ?? "en-US";
      const matchingVoices = window.speechSynthesis.getVoices();
      const preferredName = activeVoice.name.toLowerCase();
      const languageVoices = matchingVoices.filter(voice => voice.lang.toLowerCase().startsWith(locale.slice(0, 2).toLowerCase()));
      const selectedIndex = Math.max(0, voiceOptions.findIndex(voice => voice.id === activeVoice.id));
      speech.lang = locale;
      speech.voice = matchingVoices.find(voice => voice.name.toLowerCase().includes(preferredName))
        ?? languageVoices[selectedIndex % Math.max(1, languageVoices.length)]
        ?? null;
      speech.rate = Math.min(1.4, Math.max(0.7, rate));
      speech.pitch = Math.max(0, Math.min(2, 1 + pitch / 24));
      speech.volume = Math.min(1, volume / 100);
      window.speechSynthesis.speak(speech);
      setLiveCache(previous => Array.from(new Set([liveText.trim(), ...previous])).slice(0, 8));
    }, 650);
    return () => window.clearTimeout(timer);
  }, [activeVoice.name, gender, language, liveEnabled, liveText, mode, pitch, rate, volume, voiceId]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  useEffect(() => {
    window.localStorage.setItem(BATCH_HISTORY_STORAGE_KEY, JSON.stringify(batchHistory));
  }, [batchHistory]);

  useEffect(() => {
    if (mode !== "voice-batch" || performancePreviewRevision === 0 || !script.trim()) return;
    const timer = window.setTimeout(() => {
      const requestId = autoPreviewSequencerRef.current.issue();
      autoBatchPreview.mutate({ text: script.trim(), language, gender, voiceId, engine: activeVoice.engine, style, rate, pitch, volume, pause }, {
        onSuccess: result => {
          if (!autoPreviewSequencerRef.current.accepts(requestId)) return;
          const entry: RenderEntry = { ...result, text: script.trim(), label: "Performance preview", language, gender, voiceId, style, createdAt: Date.now() };
          setRenders(previous => [entry, ...previous.filter(item => item.id !== entry.id)].slice(0, 16));
          setActiveRenderId(entry.id);
          window.setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.src = entry.audioUrl;
              audioRef.current.currentTime = 0;
              audioRef.current.play().catch(() => undefined);
            }
          }, 60);
        },
        onError: error => toast.error("Performance preview failed", { description: error.message }),
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [performancePreviewRevision]);

  const selectLanguage = (nextLanguage: StudioLanguage) => {
    setLanguage(nextLanguage);
    setScript(DEFAULT_SCRIPT[nextLanguage]);
    setVoiceId(DEFAULT_VOICE[nextLanguage][gender]);
    if (mode === "voice-batch") setPerformancePreviewRevision(current => current + 1);
  };

  const selectVoiceGender = (nextGender: VoiceGender) => {
    setGender(nextGender);
    setVoiceId(DEFAULT_VOICE[language][nextGender]);
    if (mode === "voice-batch") setPerformancePreviewRevision(current => current + 1);
  };

  const selectVoiceDirection = (nextVoiceId: string) => {
    setVoiceId(nextVoiceId);
    if (mode === "voice-batch") setPerformancePreviewRevision(current => current + 1);
  };

  const applyStyle = (preset: (typeof STYLE_PRESETS)[number]) => {
    setStyle(preset.id);
    setRate(preset.rate);
    setPitch(preset.pitch);
    setVolume(preset.volume);
    setPause(preset.pause);
    if (mode === "voice-batch") setPerformancePreviewRevision(value => value + 1);
  };

  const updatePerformanceParameter = (setter: (value: number) => void, value: number) => {
    setter(value);
    if (mode === "voice-batch") setPerformancePreviewRevision(current => current + 1);
  };

  const playPreviewRender = (entry: RenderEntry) => {
    const player = audioRef.current;
    if (!player) return;
    if (activeRenderId === entry.id && !player.paused) {
      player.pause();
      return;
    }
    if (activeRenderId !== entry.id || player.src !== new URL(entry.audioUrl, window.location.origin).href) {
      player.src = entry.audioUrl;
      player.currentTime = 0;
      setPreviewProgress(0);
    }
    setActiveRenderId(entry.id);
    player.play().catch(() => undefined);
  };

  const playDefaultEnglishPreview = () => {
    if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      toast.error("English text-to-speech preview is not available in this browser.");
      return;
    }
    if (isPreviewPlaying) {
      window.speechSynthesis.cancel();
      setIsPreviewPlaying(false);
      return;
    }
    const speech = new SpeechSynthesisUtterance(DEFAULT_ENGLISH_PREVIEW_TEXT);
    const englishVoice = window.speechSynthesis.getVoices().find(voice => voice.lang.toLowerCase().startsWith("en"));
    speech.lang = englishVoice?.lang ?? "en-US";
    speech.voice = englishVoice ?? null;
    speech.rate = 0.98;
    speech.onend = () => setIsPreviewPlaying(false);
    speech.onerror = () => setIsPreviewPlaying(false);
    window.speechSynthesis.cancel();
    setActiveRenderId(null);
    setPreviewProgress(0);
    setPreviewDuration(0);
    setIsPreviewPlaying(true);
    window.speechSynthesis.speak(speech);
  };

  const addRender = (result: { id: string; duration: number; audioUrl: string; downloads: Record<AudioFormat, string> }, text: string, label: string) => {
    const entry: RenderEntry = { ...result, text, label, language, gender, voiceId, style, createdAt: Date.now() };
    setRenders(previous => [entry, ...previous].slice(0, 16));
    if (mode === "voice-batch" || mode === "voice-clone") setBatchHistory(previous => [entry, ...previous.filter(item => item.id !== entry.id)].slice(0, 12));
    window.setTimeout(() => playPreviewRender(entry), 60);
  };

  const latestRender = renders[0];
  const activeRender = renders.find(entry => entry.id === activeRenderId) ?? latestRender;

  const generateText = async (rawText: string, label: string) => {
    const text = rawText.trim();
    if (!text) return;
    const result = await generation.mutateAsync({ text, language, gender, voiceId, engine: activeVoice.engine, style, rate, pitch, volume, pause });
    addRender(result, text, label);
  };

  const generateBatch = async () => {
    const jobs = prepareBatchJobs(script, lineBreakOutput);
    if (!jobs.length) {
      toast.error("Enter a script before generating audio.");
      return;
    }
    try {
      for (let index = 0; index < jobs.length; index += 1) {
        const item = jobs[index];
        if (!item) continue;
        await generateText(item, lineBreakOutput ? `Line ${index + 1}` : "Full script");
      }
      toast.success(lineBreakOutput ? `${jobs.length} separate voice renders are ready.` : "Full script render is ready.");
    } catch (error) {
      toast.error("Generation failed", { description: error instanceof Error ? error.message : "Check your local engine setup." });
    }
  };

  const exportLive = () => generateText(liveText, "Live preview export").catch(error => toast.error("Export failed", { description: error.message }));

  const download = (entry: RenderEntry) => {
    const anchor = document.createElement("a");
    anchor.href = entry.downloads[exportFormat];
    anchor.download = `voicestudio-${entry.id}.${exportFormat}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const recordClip = async (kind: "clone" | "guide") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = event => event.data.size && chunks.push(event.data);
      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        const url = URL.createObjectURL(blob);
        if (kind === "clone") {
          setRecordingUrl(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
          setIsRecording(false);
          readDataUrl(blob).then(dataUrl => cloneCapture.mutateAsync({ dataUrl })).then(profile => {
            setCloneProfileId(profile.id);
            toast.success("Reference clip saved locally.", { description: "Your optional clone profile is ready for a local engine." });
          }).catch(error => toast.error("Unable to save the local profile", { description: error instanceof Error ? error.message : "Record a shorter clip and try again." }));
        } else {
          setGuideRecording(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
          setIsGuideRecording(false);
          extractPitchContour(url, hummingFrequency).then(contour => {
            setGuideContour(contour);
            toast.success("Melody contour captured locally.", { description: `${contour.length} local pitch points are ready.` });
          }).catch(() => {
            setGuideContour([0, 2, 4, 2, 0]);
            toast.success("Melody recording captured locally.");
          });
        }
      };
      recorder.start();
      if (kind === "clone") {
        mediaRecorderRef.current = recorder;
        setIsRecording(true);
      } else {
        guideRecorderRef.current = recorder;
        setIsGuideRecording(true);
      }
    } catch {
      toast.error("Microphone access is required for this local recording.");
    }
  };

  const stopClip = (kind: "clone" | "guide") => (kind === "clone" ? mediaRecorderRef.current : guideRecorderRef.current)?.stop();

  const generateHumming = async (guided: boolean) => {
    if (guided && !guideRecording) {
      toast.error("Record a melody contour before generating a guided hum.");
      return;
    }
    try {
      const result = await hummingGeneration.mutateAsync({
        text: hummingText,
        mode: guided ? "guided" : "random",
        mood: hummingMood,
        bpm: hummingBpm,
        style: hummingStyle,
        gender: hummingGender,
        baseFrequency: hummingFrequency,
        pitch: hummingPitch,
        volume: hummingVolume,
        contour: guided ? guideContour : undefined,
        engine: hummingEngine,
        referenceId: hummingEngine === "local-hum" ? undefined : cloneProfileId ?? undefined,
        referenceText: hummingEngine === "local-hum" ? undefined : cloneText,
        language,
      });
      addRender(result, hummingText.trim(), guided ? "Guided humming" : "Random humming");
      toast.success(guided ? "Guided hum is ready." : "Random hum is ready.");
    } catch (error) {
      toast.error("Humming generation failed", { description: error instanceof Error ? error.message : "Check your FFmpeg installation." });
    }
  };

  const generateClone = async () => {
    if (!cloneProfileId) {
      toast.error("Record a local reference before generating a clone.");
      return;
    }
    const isSupported = cloneEngine === "xtts-v2"
      ? ["mandarin", "english", "spanish", "japanese", "korean", "hindi", "arabic", "french"].includes(language)
      : ["mandarin", "english", "cantonese", "spanish", "japanese", "korean", "french"].includes(language);
    if (!isSupported) {
      toast.error(`The selected ${cloneEngine === "xtts-v2" ? "XTTS-v2" : "CosyVoice"} runner does not support this selected language yet.`);
      return;
    }
    try {
      const result = await cloneGeneration.mutateAsync({ referenceId: cloneProfileId, text: cloneTargetText, language: language as "mandarin" | "english" | "cantonese" | "spanish" | "japanese" | "korean" | "hindi" | "arabic" | "french", engine: cloneEngine, referenceText: cloneText });
      addRender(result, cloneTargetText.trim(), "Local voice clone");
      toast.success("Local cloned render is ready.");
    } catch (error) {
      toast.error("Clone generation failed", { description: error instanceof Error ? error.message : "Run the optional clone setup and try again." });
    }
  };

  const renderVoiceDirection = () => (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-100">Voice direction</p><p className="mt-1 text-[10px] text-slate-500">{languageLabel} · {activeVoice.engine === "edge" ? "Edge Neural" : activeVoice.engine === "mms" ? "Local MMS" : "Local eSpeak NG"}</p></div><SlidersHorizontal className="h-4 w-4 text-cyan-300" /></div>
      <div className="mb-4 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-[#0a0c11] p-1">
        {(["female", "male"] as const).map(item => <button key={item} type="button" onClick={() => selectVoiceGender(item)} className={`rounded-lg py-2.5 text-xs font-semibold transition ${gender === item ? "bg-white/[0.09] text-white" : "text-slate-500 hover:text-slate-300"}`}>{item === "female" ? "Female voice" : "Male voice"}</button>)}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {voiceOptions.map(voice => <button type="button" key={voice.id} onClick={() => selectVoiceDirection(voice.id)} className={`rounded-xl border px-3.5 py-3 text-left transition ${voiceId === voice.id ? "border-cyan-300/35 bg-cyan-300/[0.09]" : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.15]"}`}><p className="text-xs font-bold text-slate-200">{voice.name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{voice.role} · {voice.tone}</p></button>)}
      </div>
    </section>
  );

  const renderPerformanceStyle = () => (
    <section className="glass-panel overflow-hidden rounded-2xl"><div className="p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-100">Performance style</p><p className="mt-1 text-[10px] text-slate-500">Choose a direction, then fine-tune the local performance preview.</p></div><Lightbulb className="h-4 w-4 text-cyan-300" /></div><div className="grid grid-cols-2 gap-2 xl:grid-cols-4">{STYLE_PRESETS.map(preset => <button type="button" key={preset.id} onClick={() => applyStyle(preset)} className={`rounded-xl border px-3 py-3 text-left transition ${style === preset.id ? "border-cyan-300/35 bg-cyan-300/[0.09]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.15]"}`}><p className="text-xs font-bold text-slate-200">{preset.label}</p><p className="mt-1 text-[10px] leading-4 text-slate-500">{preset.description}</p></button>)}</div><div className="mt-5 grid gap-3 md:grid-cols-2"><ParameterSlider label="Pitch" value={pitch} min={-12} max={12} step={1} valueLabel={`${pitch > 0 ? "+" : ""}${pitch} Hz`} onChange={value => updatePerformanceParameter(setPitch, value)} /><ParameterSlider label="Speed / Rate" value={rate} min={0.7} max={1.3} step={0.01} valueLabel={`${rate.toFixed(2)}×`} onChange={value => updatePerformanceParameter(setRate, value)} /><ParameterSlider label="Volume" value={volume} min={60} max={120} step={1} valueLabel={`${volume}%`} onChange={value => updatePerformanceParameter(setVolume, value)} /><ParameterSlider label="Pause / Break" value={pause} min={0} max={1.2} step={0.02} valueLabel={`${pause.toFixed(2)}s`} onChange={value => updatePerformanceParameter(setPause, value)} /></div></div></section>
  );

  const renderLanguagePicker = () => (
    <section className="glass-panel rounded-2xl p-5 sm:p-6">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300"><Languages className="h-3.5 w-3.5 text-cyan-300" /> Render language</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {LANGUAGE_OPTIONS.map(option => <button key={option.id} type="button" onClick={() => selectLanguage(option.id)} className={`rounded-xl border px-3 py-3 text-left transition-all ${language === option.id ? "border-cyan-300/40 bg-cyan-300/[0.12] text-cyan-50" : "border-white/[0.07] bg-white/[0.025] text-slate-500 hover:border-white/[0.16] hover:text-slate-300"}`}><p className="text-xs font-bold">{option.label}</p><p className="mt-1 font-mono text-[9px] opacity-55">{option.locale}</p></button>)}
      </div>
    </section>
  );

  const renderExportShelf = (heading = "Output preview") => {
    const previewEntry = activeRender ?? latestRender ?? batchHistory[0];
    const isDefaultEnglishPreview = !previewEntry;
    const previewText = previewEntry?.text ?? DEFAULT_ENGLISH_PREVIEW_TEXT;
    const waveform = [42, 66, 91, 54, 78, 36, 83, 58, 96, 49, 71, 88, 38, 76, 57, 94, 46, 69, 85, 52, 97, 61, 41, 81, 56, 91, 44, 74, 63, 87, 48, 95, 59, 79, 43, 90];
    const progress = previewDuration > 0 ? Math.min(100, (previewProgress / previewDuration) * 100) : 0;
    return <section className="output-preview glass-panel rounded-2xl p-5 sm:p-6"><audio ref={audioRef} preload="metadata" onPlay={() => setIsPreviewPlaying(true)} onPause={() => setIsPreviewPlaying(false)} onEnded={() => { setIsPreviewPlaying(false); setPreviewProgress(0); }} onLoadedMetadata={event => setPreviewDuration(event.currentTarget.duration)} onTimeUpdate={event => setPreviewProgress(event.currentTarget.currentTime)} /><div className="relative z-10 flex items-center justify-between gap-3"><div><p className="text-sm font-bold text-slate-100">{heading}</p><p className="mt-1 text-[10px] text-slate-500">{previewEntry ? "Your latest local render" : "English text-to-speech preview"}</p></div><span className={`rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider ${previewEntry ? "border-cyan-300/[0.18] bg-cyan-300/[0.08] text-cyan-200" : "border-cyan-300/[0.15] bg-cyan-300/[0.06] text-cyan-200"}`}>{previewEntry ? "Ready" : "English default"}</span></div><div className="output-wave-shell mt-4"><div className="output-wave is-playing">{waveform.map((height, index) => <span key={index} className="output-wave-bar" style={{ height: `${height}%`, animationDelay: `${(index % 7) * 90}ms` }} />)}</div></div><div className="relative z-10 mt-4 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-[#0b0d14]/85 px-3 py-2.5"><button type="button" aria-label={isDefaultEnglishPreview ? "Play English text-to-speech preview" : "Play local render"} onClick={() => previewEntry ? playPreviewRender(previewEntry) : playDefaultEnglishPreview()} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-cyan-200 text-slate-950">{isPreviewPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}</button><span className="w-9 font-mono text-[10px] text-slate-400">{formatTime(previewProgress)}</span><div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/70"><span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-300 to-teal-300" style={{ width: `${progress}%` }} /></div><span className="w-9 text-right font-mono text-[10px] text-slate-400">{formatTime(previewEntry?.duration ?? 0)}</span></div><div className="relative z-10 mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-300">{previewText}</p><p className="mt-1 text-[10px] text-slate-600">{previewEntry ? `${formatTime(previewEntry.duration)} · ${previewEntry.label}` : "Browser English text-to-speech · generate a local render to export."}</p></div>{previewEntry && <button type="button" onClick={() => download(previewEntry)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/[0.1] px-2.5 py-1.5 text-[10px] font-semibold text-slate-300 hover:border-cyan-300/35"><Download className="h-3.5 w-3.5" /> {formatLabel(exportFormat)}</button>}</div><div className="relative z-10 mt-3 flex gap-1.5">{(["mp3", "wav", "aac"] as AudioFormat[]).map(format => <button type="button" key={format} onClick={() => setExportFormat(format)} className={`rounded-md px-2.5 py-1.5 font-mono text-[10px] transition ${exportFormat === format ? "bg-cyan-200 text-slate-950" : "bg-white/[0.045] text-slate-500 hover:text-slate-300"}`}>{formatLabel(format)}</button>)}</div></section>;
  };

  const renderGenerationHistory = () => <section id="history" className="glass-panel mt-5 rounded-2xl p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-slate-300"><FolderClock className="h-4 w-4" /></div><div><p className="text-sm font-bold text-slate-100">Generation history</p><p className="mt-0.5 text-[10px] text-slate-500">Stored in this browser · {batchHistory.length} local renders</p></div></div>{batchHistory.length > 0 && <button type="button" onClick={() => { setBatchHistory([]); setRenders([]); setActiveRenderId(null); setIsPreviewPlaying(false); }} className="text-[11px] text-slate-500 transition hover:text-slate-200">Clear history</button>}</div>{batchHistory.length === 0 ? <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.09] bg-white/[0.015] text-center"><FolderClock className="mb-2 h-5 w-5 text-slate-600" /><p className="text-xs font-medium text-slate-400">No renders yet</p><p className="mt-1 text-[10px] text-slate-600">Generated voiceovers will appear here for replay and export.</p></div> : <div className="studio-scroll overflow-x-auto"><div className="min-w-[720px] overflow-hidden rounded-xl border border-white/[0.07]"><div className="grid grid-cols-[minmax(260px,1.7fr)_110px_120px_100px_148px] border-b border-white/[0.07] bg-white/[0.025] px-4 py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] text-slate-600"><span>Script</span><span>Voice</span><span>Created</span><span>Length</span><span className="text-right">Actions</span></div>{batchHistory.map(entry => { const itemVoice = entry.language ? Object.values(VOICE_CATALOG[entry.language]).flat().find(voice => voice.id === entry.voiceId) : undefined; return <div key={entry.id} className="grid grid-cols-[minmax(260px,1.7fr)_110px_120px_100px_148px] items-center px-4 py-3.5 text-xs transition hover:bg-white/[0.025]"><div className="min-w-0 pr-5"><p className="truncate font-semibold text-slate-300">{entry.text}</p><p className="mt-1 text-[10px] text-slate-600">{LANGUAGE_OPTIONS.find(option => option.id === entry.language)?.label} · {entry.gender === "female" ? "Female" : "Male"}</p></div><span className="text-slate-400">{itemVoice?.name ?? entry.voiceId}</span><span className="text-[11px] text-slate-500">{formatHistoryDate(entry.createdAt)}</span><span className="font-mono text-[11px] text-slate-500">{formatTime(entry.duration)}</span><div className="flex items-center justify-end gap-2"><button type="button" onClick={() => playPreviewRender(entry)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.09] text-slate-300 transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.09]" aria-label="Replay"><Play className="h-3.5 w-3.5 fill-current" /></button><button type="button" onClick={() => download(entry)} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.09] px-2.5 text-[10px] font-semibold text-slate-300 transition hover:border-cyan-300/35 hover:bg-cyan-300/[0.09]"><Download className="h-3.5 w-3.5" /> {formatLabel(exportFormat)}</button></div></div>})}</div></div>}</section>;

  const renderBatch = () => (
    <div>
      <div className="mb-7 flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300"><Sparkles className="h-3.5 w-3.5" /> Studio-grade speech</div><h1 className="text-3xl font-extrabold tracking-[-0.05em] text-white sm:text-[37px]">Script to voice, with intent.</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Turn scripts into polished voices for video, podcasts, and narrative work. Choose a voice, set the pace, and export locally.</p></div><div className="flex items-center gap-2 text-[11px] text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300" /> AI-generated speech disclosure enabled</div></div>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.32fr)_minmax(390px,.86fr)]">
        <div className="space-y-5"><section className="glass-panel overflow-hidden rounded-2xl"><div className="p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-100">Script editor</p><p className="mt-1 text-[10px] text-slate-500">{script.trim().length} characters · {lineBreakOutput ? `${prepareBatchJobs(script, true).length} line jobs` : "one full-script job"}</p></div><Mic2 className="h-4 w-4 text-cyan-300" /></div><textarea className="min-h-[350px] w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0c11] p-4 text-sm leading-7 text-slate-200 outline-none transition placeholder:text-slate-600 focus:border-cyan-300/40 focus:ring-4 focus:ring-cyan-300/[0.06]" maxLength={3000} value={script} onChange={event => setScript(event.target.value)} placeholder="Paste or write the script you want to narrate…" /><div className="mt-4 flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-[#0a0c11]/60 p-3.5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-slate-200">Line-break output</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Render every non-empty line as its own local file. When off, line breaks remain inside one script.</p></div><button type="button" role="switch" aria-checked={lineBreakOutput} onClick={() => setLineBreakOutput(value => !value)} className={`relative h-7 w-12 shrink-0 rounded-full transition ${lineBreakOutput ? "bg-cyan-300" : "bg-slate-700"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${lineBreakOutput ? "left-6" : "left-1"}`} /></button></div></div></section>{renderLanguagePicker()}{renderVoiceDirection()}{renderPerformanceStyle()}</div>
        <div className="space-y-5">{renderExportShelf()}</div>
      </div>
      <div className="mt-5 flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-cyan-300/[0.14] bg-gradient-to-r from-cyan-300/[0.12] via-cyan-300/[0.055] to-transparent p-4 sm:flex-row sm:items-center sm:px-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-200 text-slate-900"><WandSparkles className="h-4 w-4" /></div><div><p className="text-sm font-bold text-slate-100">Ready to render</p><p className="mt-0.5 text-[10px] text-slate-400">{languageLabel} · {activeVoice.name} · {STYLE_PRESETS.find(item => item.id === style)?.label}{lineBreakOutput ? ` · ${prepareBatchJobs(script, true).length || 0} line files` : ""}</p></div></div><button type="button" disabled={generation.isPending} onClick={generateBatch} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-200 via-cyan-300 to-teal-300 px-5 text-sm font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(45,212,191,.16)] transition hover:brightness-105 active:scale-[0.98] disabled:cursor-wait disabled:opacity-65"><Sparkles className="h-4 w-4" /> {generation.isPending ? "Rendering locally…" : lineBreakOutput ? "Generate line renders" : "Generate voice"}</button></div>
      {renderGenerationHistory()}
    </div>
  );

  const renderLive = () => (
    <div className="space-y-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Create voice / Live preview</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] text-white">Hear the idea while it is still moving.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Live preview reads your typing through a local browser voice cache. It never creates an export until you explicitly choose Generate voice.</p></div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(370px,.75fr)]">
        <div className="space-y-5"><section className="glass-panel rounded-2xl p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-100">Live text buffer</p><p className="mt-1 text-[10px] text-slate-500">Typing pauses for 650 ms before local preview speech.</p></div><Radio className={`h-4 w-4 ${liveEnabled ? "text-cyan-300" : "text-slate-600"}`} /></div><textarea className="min-h-[240px] w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0c11] p-4 text-sm leading-7 text-slate-200 outline-none focus:border-cyan-300/40" value={liveText} onChange={event => setLiveText(event.target.value)} /><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-cyan-300/[0.12] bg-cyan-300/[0.05] p-3"><p className="text-xs font-bold text-cyan-100">Browser-only audition</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Live speech uses the current browser and never creates an audio file by itself.</p></div><div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"><p className="text-xs font-bold text-slate-200">Explicit export</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Choose Generate voice only when you want a local MP3, WAV, or AAC render.</p></div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><button type="button" onClick={() => setLiveEnabled(value => !value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${liveEnabled ? "bg-cyan-300/[0.12] text-cyan-100" : "bg-white/[0.05] text-slate-400"}`}>{liveEnabled ? "Live preview on" : "Live preview off"}</button><button type="button" onClick={() => window.speechSynthesis?.cancel()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-2 text-xs text-slate-300"><Square className="h-3.5 w-3.5 fill-current" /> Stop preview</button><button type="button" disabled={generation.isPending} onClick={exportLive} className="inline-flex items-center gap-2 rounded-lg bg-cyan-200 px-3.5 py-2 text-xs font-bold text-slate-950"><Download className="h-3.5 w-3.5" /> Generate voice</button></div></section>{renderLanguagePicker()}{renderVoiceDirection()}{renderPerformanceStyle()}</div>
        <div className="space-y-5"><section className="glass-panel rounded-2xl p-5"><p className="text-sm font-bold text-slate-100">Local preview cache</p><p className="mt-1 text-[10px] text-slate-500">Recent preview texts are held only in this browser session.</p><div className="mt-4 space-y-2">{liveCache.length ? liveCache.map(item => <p className="truncate rounded-lg bg-white/[0.03] px-3 py-2 text-[11px] text-slate-400" key={item}>{item}</p>) : <p className="rounded-lg border border-dashed border-white/[0.08] px-3 py-6 text-center text-xs text-slate-600">Start typing to create a local preview cache.</p>}</div></section>{renderExportShelf("Live preview")}</div>
      </div>
    </div>
  );

  const renderClone = () => (
    <div className="space-y-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Create voice / Voice clone</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] text-white">Build a local voice profile with consent.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Record the supplied reference text to create a local profile. Full clone rendering uses the optional local XTTS runner; reference audio stays in the local project directory.</p></div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.16fr)_minmax(390px,.84fr)]">
        <section className="glass-panel rounded-2xl p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-100">Reference recording</p><p className="mt-1 text-[10px] text-slate-500">Read the text naturally for 20–40 seconds in a quiet room.</p></div><Mic2 className="h-5 w-5 text-cyan-300" /></div><textarea className="mt-5 min-h-[145px] w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0c11] p-4 text-sm leading-7 text-slate-200 outline-none focus:border-cyan-300/40" value={cloneText} onChange={event => setCloneText(event.target.value)} /><label className="mt-4 flex gap-3 rounded-xl border border-amber-300/[0.17] bg-amber-300/[0.05] p-3.5 text-xs leading-5 text-amber-100"><input className="mt-1" type="checkbox" checked={cloneConsent} onChange={event => setCloneConsent(event.target.checked)} />I own this voice or have the speaker's explicit permission to record and use it. I will not use this tool for impersonation or deception.</label><div className="mt-4 flex flex-wrap items-center gap-2">{isRecording ? <button type="button" onClick={() => stopClip("clone")} className="inline-flex items-center gap-2 rounded-lg bg-rose-300 px-3.5 py-2 text-xs font-bold text-rose-950"><Square className="h-3.5 w-3.5 fill-current" /> Stop recording</button> : <button type="button" disabled={!cloneConsent || cloneCapture.isPending} onClick={() => recordClip("clone")} className="inline-flex items-center gap-2 rounded-lg bg-cyan-200 px-3.5 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"><Mic2 className="h-3.5 w-3.5" /> Record reference</button>}{recordingUrl && <audio className="h-9 max-w-full" controls src={recordingUrl} />}{cloneProfileId && <span className="self-center font-mono text-[10px] text-emerald-200">Profile saved locally</span>}</div></section>
        <section className="glass-panel rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" /><p className="text-sm font-bold text-slate-100">Local clone engine</p></div>
          <label className="mt-4 block text-xs font-semibold text-slate-200">Model runner
            <select value={cloneEngine} onChange={event => setCloneEngine(event.target.value as CloneEngine)} className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0a0c11] px-3 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/40">
              {CLONE_ENGINE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label} — {option.detail}</option>)}
            </select>
          </label>
          <div className="mt-3 rounded-xl border border-amber-300/[0.2] bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100"><p className="font-bold">XTTS-v2: local research and non-commercial use only</p><p className="mt-1 text-amber-100/80">This project exposes XTTS-v2 only for local research and non-commercial use. Review and accept the Coqui Public Model License yourself before the first model download.</p></div>
          <p className="mt-3 text-xs leading-6 text-slate-500">CosyVoice 2 and CosyVoice 3 are also optional local runners. They require an official local checkout, locally downloaded weights, and a reference recording; no reference audio is uploaded by this workspace.</p>
          <pre className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/25 p-3 font-mono text-[10px] leading-5 text-cyan-100">pnpm voice:setup:clone</pre>
          <p className="mt-4 text-xs font-semibold text-slate-200">Text to render with this profile</p>
          <textarea className="mt-2 min-h-[150px] w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0c11] p-3 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-300/40" value={cloneTargetText} onChange={event => setCloneTargetText(event.target.value)} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-cyan-300/[0.12] bg-cyan-300/[0.05] p-3"><p className="text-xs font-bold text-cyan-100">Reference stays local</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Your clip is held in the project reference folder for this optional local runner.</p></div><div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"><p className="text-xs font-bold text-slate-200">Render deliberately</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Review the target text, then generate one exportable local voice render.</p></div></div>
          <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={!cloneProfileId || cloneGeneration.isPending} onClick={generateClone} className="inline-flex items-center gap-2 rounded-lg bg-cyan-200 px-3.5 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"><HeartPulse className="h-3.5 w-3.5" /> {cloneGeneration.isPending ? "Generating clone…" : "Generate cloned voice"}</button><span className="self-center text-[10px] text-slate-500">Current target: {languageLabel}</span></div>
        </section>
      </div>
      {renderExportShelf()}
    </div>
  );

  const renderCloneStudio = () => (
    <div className="space-y-5">
      <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-300">Create voice / Voice clone</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] text-white">Build a local voice profile with consent.</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Capture a local reference, choose a supported output language and optional engine, then create an exportable voice clone without uploading the recording.</p></div>
      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1.32fr)_minmax(390px,.86fr)]">
        <div className="space-y-5">
          <section className="glass-panel rounded-2xl p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-slate-100">Reference recording</p><p className="mt-1 text-[10px] text-slate-500">Read naturally for 20–40 seconds in a quiet room.</p></div><Mic2 className="h-5 w-5 text-cyan-300" /></div><textarea className="mt-5 min-h-[145px] w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0c11] p-4 text-sm leading-7 text-slate-200 outline-none focus:border-cyan-300/40" value={cloneText} onChange={event => setCloneText(event.target.value)} /><label className="mt-4 flex gap-3 rounded-xl border border-amber-300/[0.17] bg-amber-300/[0.05] p-3.5 text-xs leading-5 text-amber-100"><input className="mt-1" type="checkbox" checked={cloneConsent} onChange={event => setCloneConsent(event.target.checked)} />I own this voice or have the speaker&apos;s explicit permission to record and use it. I will not use this tool for impersonation or deception.</label><div className="mt-4 flex flex-wrap items-center gap-2">{isRecording ? <button type="button" onClick={() => stopClip("clone")} className="inline-flex items-center gap-2 rounded-lg bg-rose-300 px-3.5 py-2 text-xs font-bold text-rose-950"><Square className="h-3.5 w-3.5 fill-current" /> Stop recording</button> : <button type="button" disabled={!cloneConsent || cloneCapture.isPending} onClick={() => recordClip("clone")} className="inline-flex items-center gap-2 rounded-lg bg-cyan-200 px-3.5 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"><Mic2 className="h-3.5 w-3.5" /> Record reference</button>}{recordingUrl && <audio className="h-9 max-w-full" controls src={recordingUrl} />}{cloneProfileId && <span className="self-center font-mono text-[10px] text-emerald-200">Profile saved locally</span>}</div></section>
          {renderLanguagePicker()}
          <section className="glass-panel rounded-2xl p-5 sm:p-6"><div className="flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-300" /><p className="text-sm font-bold text-slate-100">Local clone engine</p></div><label className="mt-4 block text-xs font-semibold text-slate-200">Model runner<select value={cloneEngine} onChange={event => setCloneEngine(event.target.value as CloneEngine)} className="mt-2 w-full rounded-xl border border-white/[0.08] bg-[#0a0c11] px-3 py-3 text-sm text-slate-100 outline-none focus:border-cyan-300/40">{CLONE_ENGINE_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label} — {option.detail}</option>)}</select></label><div className="mt-3 rounded-xl border border-amber-300/[0.2] bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100"><p className="font-bold">XTTS-v2: local research and non-commercial use only</p><p className="mt-1 text-amber-100/80">Review and accept the Coqui Public Model License yourself before the first local model download.</p></div><p className="mt-3 text-xs leading-6 text-slate-500">CosyVoice 2 and CosyVoice 3 remain optional local runners with user-installed official weights. The reference recording stays in this local project.</p><pre className="mt-4 overflow-x-auto rounded-xl border border-white/[0.08] bg-black/25 p-3 font-mono text-[10px] leading-5 text-cyan-100">pnpm voice:setup:clone</pre><label className="mt-4 block text-xs font-semibold text-slate-200">Text to render with this profile<textarea className="mt-2 min-h-[150px] w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0c11] p-3 text-sm leading-6 text-slate-200 outline-none focus:border-cyan-300/40" value={cloneTargetText} onChange={event => setCloneTargetText(event.target.value)} /></label><div className="mt-3 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-cyan-300/[0.12] bg-cyan-300/[0.05] p-3"><p className="text-xs font-bold text-cyan-100">Reference stays local</p><p className="mt-1 text-[10px] leading-5 text-slate-500">The clip is held in the project reference folder for this optional local runner.</p></div><div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"><p className="text-xs font-bold text-slate-200">Render deliberately</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Review the target text, then create one exportable local voice render.</p></div></div></section>
        </div>
        <div className="space-y-5">{renderExportShelf()}</div>
      </div>
      <div className="flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-cyan-300/[0.14] bg-gradient-to-r from-cyan-300/[0.12] via-cyan-300/[0.055] to-transparent p-4 sm:flex-row sm:items-center sm:px-5"><div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-200 text-slate-900"><HeartPulse className="h-4 w-4" /></div><div><p className="text-sm font-bold text-slate-100">Ready to clone</p><p className="mt-0.5 text-[10px] text-slate-400">{languageLabel} · {CLONE_ENGINE_OPTIONS.find(option => option.id === cloneEngine)?.label} · {cloneProfileId ? "Local profile ready" : "Reference required"}</p></div></div><button type="button" disabled={!cloneProfileId || cloneGeneration.isPending} onClick={generateClone} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-200 via-cyan-300 to-teal-300 px-5 text-sm font-extrabold text-slate-950 shadow-[0_10px_30px_rgba(45,212,191,.16)] transition hover:brightness-105 active:scale-[0.98] disabled:cursor-wait disabled:opacity-55"><HeartPulse className="h-4 w-4" /> {cloneGeneration.isPending ? "Generating clone…" : "Generate cloned voice"}</button></div>
      {renderGenerationHistory()}
    </div>
  );

  const renderHummingControls = (guided: boolean) => {
    const needsCloneReference = hummingEngine !== "local-hum" && !cloneProfileId;
    return (
      <div className="space-y-5">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">Create humming / {guided ? "Melody guided" : "Text humming"}</p><h1 className="mt-2 text-3xl font-extrabold tracking-[-0.045em] text-white">{guided ? "Turn a private hum into a reusable melodic contour." : "Turn written words into an unaccompanied vocal hum."}</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-slate-400">{guided ? "Capture a short humming phrase through your microphone, then use its locally extracted pitch contour to guide the next dry vocal pass." : "Write the lyric or phrase you want to vocalize. VoiceStudio produces a dry humming voice with no backing track or instrumental accompaniment."}</p></div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(390px,.8fr)]">
          <section className="glass-panel rounded-2xl p-5 sm:p-6">
            <label className="block text-xs font-semibold text-slate-200">Text to hum<textarea className="mt-2 min-h-[230px] w-full resize-y rounded-xl border border-white/[0.07] bg-[#0a0c11] p-4 text-sm leading-7 text-slate-200 outline-none focus:border-amber-200/40" value={hummingText} onChange={event => setHummingText(event.target.value)} placeholder="Write the text you want to hear as an unaccompanied hum…" /></label>
            <div className="mt-4 grid gap-2 sm:grid-cols-2"><div className="rounded-xl border border-amber-200/[0.15] bg-amber-200/[0.05] p-3"><p className="text-xs font-bold text-amber-100">Dry vocal only</p><p className="mt-1 text-[10px] leading-5 text-slate-500">The local text-hum path does not add an instrumental bed or accompaniment.</p></div><div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3"><p className="text-xs font-bold text-slate-200">Shape the phrase</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Use mood, BPM, frequency, pitch, and volume to guide the vocal gesture.</p></div></div>
            {guided ? <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4"><p className="text-sm font-bold text-slate-200">Melody capture</p><p className="mt-1 text-[10px] leading-5 text-slate-500">Hum a short melody. VoiceStudio extracts a pitch contour locally from the recording; the original clip remains in this browser.</p><div className="mt-3 flex flex-wrap items-center gap-2">{isGuideRecording ? <button type="button" onClick={() => stopClip("guide")} className="rounded-lg bg-rose-300 px-3 py-2 text-xs font-bold text-rose-950">Stop humming</button> : <button type="button" onClick={() => recordClip("guide")} className="inline-flex items-center gap-2 rounded-lg bg-amber-200 px-3 py-2 text-xs font-bold text-amber-950"><Mic2 className="h-3.5 w-3.5" /> Record melody</button>}{guideRecording && <audio className="h-9" controls src={guideRecording} />}{guideContour.length > 0 && <span className="font-mono text-[10px] text-amber-100">{guideContour.length} pitch points</span>}</div></div> : <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{["Hopeful", "Dreamy", "Playful", "Focused"].map(item => <button type="button" key={item} onClick={() => setHummingMood(item)} className={`rounded-xl border px-3 py-3 text-xs font-bold transition ${hummingMood === item ? "border-amber-200/50 bg-amber-200/[0.1] text-amber-100" : "border-white/[0.07] text-slate-500 hover:text-slate-300"}`}>{item}</button>)}</div>}
            {needsCloneReference && <p className="mt-4 rounded-xl border border-amber-300/[0.18] bg-amber-300/[0.06] p-3 text-xs leading-5 text-amber-100">CosyVoice text humming needs a saved local reference profile. Record one in Voice Clone first, then return here.</p>}
            <button type="button" disabled={hummingGeneration.isPending || (guided && !guideRecording) || needsCloneReference} onClick={() => generateHumming(guided)} className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-100 via-amber-200 to-orange-200 px-5 text-sm font-extrabold text-amber-950 disabled:cursor-wait disabled:opacity-55"><Music2 className="h-4 w-4" /> {hummingGeneration.isPending ? "Generating text hum…" : guided ? "Generate guided hum" : "Generate text hum"}</button>
          </section>
          <section className="glass-panel rounded-2xl p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-bold text-slate-100">Humming direction</p><p className="mt-1 text-[10px] text-slate-500">Dry vocal synthesis — no accompaniment</p></div><Music2 className="h-4 w-4 text-amber-200" /></div><label className="mb-4 block text-xs font-semibold text-slate-200">Vocal engine<select value={hummingEngine} onChange={event => setHummingEngine(event.target.value as HummingEngine)} className="mt-2 w-full rounded-lg border border-white/[0.08] bg-[#0a0c11] px-3 py-2.5 text-sm text-slate-200"><option value="local-hum">VoiceStudio local hum texture</option><option value="cosyvoice2">CosyVoice 2 local vocal hum</option><option value="cosyvoice3">CosyVoice 3 local vocal hum</option></select></label><div className="mb-4 grid grid-cols-2 rounded-xl border border-white/[0.07] bg-[#0a0c11] p-1">{(["female", "male"] as const).map(item => <button key={item} type="button" onClick={() => setHummingGender(item)} className={`rounded-lg py-2.5 text-xs font-semibold ${hummingGender === item ? "bg-white/[0.09] text-white" : "text-slate-500"}`}>{item === "female" ? "Female hum" : "Male hum"}</button>)}</div><div className="mb-4 grid grid-cols-2 gap-2"><select value={hummingStyle} onChange={event => setHummingStyle(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#0a0c11] px-3 py-2 text-xs text-slate-200"><option>Ambient</option><option>Folk</option><option>Lo-fi</option><option>Cinematic</option></select><select value={hummingMood} onChange={event => setHummingMood(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#0a0c11] px-3 py-2 text-xs text-slate-200"><option>Hopeful</option><option>Dreamy</option><option>Playful</option><option>Focused</option></select></div><div className="grid gap-3"><ParameterSlider label="BPM" value={hummingBpm} min={55} max={160} step={1} valueLabel={`${hummingBpm} BPM`} onChange={setHummingBpm} /><ParameterSlider label="Frequency" value={hummingFrequency} min={110} max={440} step={1} valueLabel={`${hummingFrequency} Hz`} onChange={setHummingFrequency} /><ParameterSlider label="Pitch" value={hummingPitch} min={-12} max={12} step={1} valueLabel={`${hummingPitch > 0 ? "+" : ""}${hummingPitch} st`} onChange={setHummingPitch} /><ParameterSlider label="Volume" value={hummingVolume} min={30} max={120} step={1} valueLabel={`${hummingVolume}%`} onChange={setHummingVolume} /></div></section>
        </div>
        {renderExportShelf()}
      </div>
    );
  };

  const workspace = mode === "voice-welcome" ? <WelcomePanel kind="voice" eyebrow="Voice creation suite" title="One studio. Three ways to find the voice." description="Explore deliberate batch rendering, local speech preview as you type, or an optional consent-led local reference profile. Start with a mode, then let the studio keep the technical details in view." actionLabel="Try batch text" onAction={selectMode} cards={[{ title: "Batch text", body: "Render full scripts or separate each line into its own voice file.", icon: <AudioLines className="h-4 w-4" />, actionLabel: "Try batch text", mode: "voice-batch" }, { title: "Live preview", body: "Hear local browser speech while you explore wording.", icon: <Radio className="h-4 w-4" />, actionLabel: "Try live preview", mode: "voice-live" }, { title: "Voice clone", body: "Record a consent-led local reference for an optional engine.", icon: <Mic2 className="h-4 w-4" />, actionLabel: "Try voice clone", mode: "voice-clone" }]} /> : mode === "voice-batch" ? renderBatch() : mode === "voice-live" ? renderLive() : mode === "voice-clone" ? renderCloneStudio() : mode === "humming-welcome" ? <WelcomePanel kind="humming" eyebrow="Humming creation suite" title="From a line of text to a melodic gesture." description="Create a local synthetic hum from text and musical direction, or capture a short melody contour through your microphone to guide the next pass." actionLabel="Try text hum" onAction={selectMode} cards={[{ title: "Text humming", body: "Turn text into a dry, unaccompanied humming phrase.", icon: <Music2 className="h-4 w-4" />, actionLabel: "Try text hum", mode: "humming-random" }, { title: "Melody guided", body: "Use your own hummed contour as a private local guide.", icon: <Waves className="h-4 w-4" />, actionLabel: "Try guided hum", mode: "humming-guided" }, { title: "Local cache", body: "Preview locally, then explicitly choose export formats.", icon: <Headphones className="h-4 w-4" />, actionLabel: "Open text hum", mode: "humming-random" }]} /> : renderHummingControls(mode === "humming-guided");

  return (
    <div className="studio-surface min-h-screen text-slate-100">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[254px] flex-col border-r border-white/[0.07] bg-[#0b0d12]/95 px-4 py-5 backdrop-blur-xl lg:flex"><div className="flex items-center gap-3 px-2"><div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-200 via-cyan-400 to-teal-500 text-slate-950 shadow-[0_0_30px_rgba(74,222,228,.22)]"><AudioLines className="h-5 w-5 stroke-[2.3]" /></div><div><p className="text-[15px] font-extrabold tracking-[-0.04em] text-white">VoiceStudio</p><p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-cyan-300/70">Local creation suite</p></div></div><nav className="mt-9 space-y-5"><p className="px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-600">Workspace</p><SectionNav title="Create voice" active={mode} rootMode="voice-welcome" children={VOICE_MODES} onSelect={selectMode} /><SectionNav title="Create humming" active={mode} rootMode="humming-welcome" children={HUMMING_MODES} onSelect={selectMode} /></nav><div className="mt-auto rounded-2xl border border-cyan-300/[0.12] bg-gradient-to-br from-cyan-300/[0.1] to-transparent p-4"><div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-300/15 text-cyan-200"><Headphones className="h-4 w-4" /></div><p className="text-xs font-semibold text-slate-200">100% local workflow</p><p className="mt-1.5 text-[11px] leading-5 text-slate-500">No account. No API key. Audio stays in your local project folder.</p></div></aside>
      <div className="lg:pl-[254px]"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-white/[0.07] bg-[#08090d]/75 px-4 backdrop-blur-xl sm:px-7"><div className="flex items-center gap-3"><button className="grid h-9 w-9 place-items-center rounded-lg border border-white/[0.08] text-slate-300 lg:hidden" type="button" aria-label="Toggle navigation" onClick={() => setIsMenuOpen(value => !value)}>{isMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button><div><p className="text-sm font-bold tracking-[-0.02em] text-white">{mode.startsWith("humming") ? "Humming workspace" : "Voice workspace"}</p><p className="mt-0.5 text-[10px] text-slate-500">Local creation pipeline · explicit export</p></div></div><div className="flex items-center gap-2 rounded-full border border-emerald-300/[0.12] bg-emerald-300/[0.06] px-3 py-1.5 text-[10px] font-medium text-emerald-200"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.8)]" /> Local engine ready</div></header>{isMenuOpen && <div className="border-b border-white/[0.07] bg-[#10131a] p-4 lg:hidden"><div className="grid gap-3"><SectionNav title="Create voice" active={mode} rootMode="voice-welcome" children={VOICE_MODES} onSelect={selectMode} /><SectionNav title="Create humming" active={mode} rootMode="humming-welcome" children={HUMMING_MODES} onSelect={selectMode} /></div></div>}<main className="mx-auto max-w-[1560px] px-4 py-7 sm:px-7 lg:px-9">{workspace}</main></div>
    </div>
  );
}
