export type StudioLanguage =
  | "mandarin"
  | "english"
  | "cantonese"
  | "spanish"
  | "quechua"
  | "aymara"
  | "guarani"
  | "japanese"
  | "thai"
  | "korean"
  | "hindi"
  | "arabic"
  | "french";

export type VoiceGender = "female" | "male";
export type AudioFormat = "mp3" | "wav" | "aac";
export type VoiceEngine = "edge" | "espeak" | "mms";
export type CloneEngine = "xtts-v2" | "cosyvoice2" | "cosyvoice3";
export type HummingEngine = "local-hum" | "cosyvoice2" | "cosyvoice3";

export const CLONE_ENGINE_OPTIONS: Array<{ id: CloneEngine; label: string; detail: string }> = [
  { id: "xtts-v2", label: "XTTS-v2", detail: "Local reference clone" },
  { id: "cosyvoice2", label: "CosyVoice 2", detail: "Optional local zero-shot voice" },
  { id: "cosyvoice3", label: "CosyVoice 3", detail: "Optional local instruct voice" },
];

export type VoicePreset = {
  id: string;
  name: string;
  role: string;
  tone: string;
  engine: VoiceEngine;
};

export const LANGUAGE_OPTIONS: Array<{ id: StudioLanguage; label: string; locale: string; engine: VoiceEngine }> = [
  { id: "english", label: "English", locale: "en-US", engine: "edge" },
  { id: "spanish", label: "Spanish", locale: "es-ES", engine: "edge" },
  { id: "mandarin", label: "Mandarin", locale: "zh-CN", engine: "edge" },
  { id: "cantonese", label: "Cantonese", locale: "zh-HK", engine: "edge" },
  { id: "quechua", label: "Quechua", locale: "qu", engine: "espeak" },
  { id: "aymara", label: "Aymara", locale: "ayr", engine: "mms" },
  { id: "guarani", label: "Guarani", locale: "gn", engine: "espeak" },
  { id: "japanese", label: "Japanese", locale: "ja-JP", engine: "edge" },
  { id: "thai", label: "Thai", locale: "th-TH", engine: "edge" },
  { id: "korean", label: "Korean", locale: "ko-KR", engine: "edge" },
  { id: "hindi", label: "Hindi", locale: "hi-IN", engine: "edge" },
  { id: "arabic", label: "Arabic", locale: "ar-SA", engine: "edge" },
  { id: "french", label: "French", locale: "fr-FR", engine: "edge" },
];

export const DEFAULT_SCRIPT: Record<StudioLanguage, string> = {
  english: "In the first light of morning, every story can find a voice of its own.",
  spanish: "En la primera luz de la mañana, cada historia puede encontrar su propia voz.",
  mandarin: "在清晨的第一缕光里，每个故事都能找到属于自己的声音。",
  cantonese: "喺清晨嘅第一道光裡面，每個故事都可以搵到屬於自己嘅聲音。",
  quechua: "Allin p'unchay. Kayqa VoiceStudio nisqa qillqasqami.",
  aymara: "Kamisaraki. Aka qillqatax VoiceStudio uñt'ayawiwa.",
  guarani: "Mba'éichapa. Kóva ha'e VoiceStudio ñemoñare.",
  japanese: "朝の最初の光の中で、すべての物語は自分だけの声を見つけられます。",
  thai: "ในแสงแรกของยามเช้า ทุกเรื่องราวสามารถค้นพบเสียงของตัวเองได้",
  korean: "아침의 첫빛 속에서 모든 이야기는 자신만의 목소리를 찾을 수 있습니다.",
  hindi: "सुबह की पहली रोशनी में, हर कहानी अपनी आवाज़ पा सकती है।",
  arabic: "في أول ضوء من الصباح، يمكن لكل قصة أن تجد صوتها الخاص.",
  french: "Dans la première lumière du matin, chaque histoire peut trouver sa propre voix.",
};

export function prepareBatchJobs(script: string, lineBreakOutput: boolean) {
  if (!lineBreakOutput) return script.trim() ? [script.trim()] : [];
  return script.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

export function isLatestPreviewRequest(requestId: number, latestRequestId: number) {
  return requestId === latestRequestId;
}

export function createAutoPreviewSequencer() {
  let latestRequestId = 0;
  return {
    issue() {
      latestRequestId += 1;
      return latestRequestId;
    },
    accepts(requestId: number) {
      return isLatestPreviewRequest(requestId, latestRequestId);
    },
  };
}

export const VOICE_CATALOG: Record<StudioLanguage, Record<VoiceGender, VoicePreset[]>> = {
  mandarin: {
    female: [
      { id: "zh-CN-XiaoxiaoNeural", name: "Xiaoxiao", role: "News · Narrative", tone: "Warm, clear", engine: "edge" },
      { id: "zh-CN-XiaoyiNeural", name: "Xiaoyi", role: "Character · Story", tone: "Lively, expressive", engine: "edge" },
      { id: "zh-CN-liaoning-XiaobeiNeural", name: "Xiaobei", role: "Casual · Dialect", tone: "Humorous, bright", engine: "edge" },
    ],
    male: [
      { id: "zh-CN-YunxiNeural", name: "Yunxi", role: "Story · Narration", tone: "Bright, natural", engine: "edge" },
      { id: "zh-CN-YunyangNeural", name: "Yunyang", role: "News · Business", tone: "Professional, reliable", engine: "edge" },
      { id: "zh-CN-YunjianNeural", name: "Yunjian", role: "Sport · Energy", tone: "Full, powerful", engine: "edge" },
    ],
  },
  english: {
    female: [
      { id: "en-US-AriaNeural", name: "Aria", role: "News · Novel", tone: "Confident, clear", engine: "edge" },
      { id: "en-US-JennyNeural", name: "Jenny", role: "General · Warm", tone: "Friendly, considerate", engine: "edge" },
      { id: "en-US-EmmaNeural", name: "Emma", role: "Conversation", tone: "Cheerful, natural", engine: "edge" },
    ],
    male: [
      { id: "en-US-ChristopherNeural", name: "Christopher", role: "News · Novel", tone: "Reliable, authoritative", engine: "edge" },
      { id: "en-US-GuyNeural", name: "Guy", role: "News · Novel", tone: "Energetic, direct", engine: "edge" },
      { id: "en-US-BrianNeural", name: "Brian", role: "Conversation", tone: "Warm, authentic", engine: "edge" },
    ],
  },
  cantonese: {
    female: [
      { id: "zh-HK-HiuMaanNeural", name: "HiuMaan", role: "Cantonese · General", tone: "Friendly, natural", engine: "edge" },
      { id: "zh-HK-HiuGaaiNeural", name: "HiuGaai", role: "Cantonese · General", tone: "Bright, approachable", engine: "edge" },
    ],
    male: [
      { id: "zh-HK-WanLungNeural", name: "WanLung", role: "Cantonese · General", tone: "Steady, composed", engine: "edge" },
    ],
  },
  spanish: {
    female: [
      { id: "es-ES-ElviraNeural", name: "Elvira", role: "Spain · General", tone: "Clear, welcoming", engine: "edge" },
      { id: "es-MX-DaliaNeural", name: "Dalia", role: "Mexico · General", tone: "Natural, warm", engine: "edge" },
    ],
    male: [
      { id: "es-ES-AlvaroNeural", name: "Alvaro", role: "Spain · General", tone: "Steady, articulate", engine: "edge" },
      { id: "es-MX-JorgeNeural", name: "Jorge", role: "Mexico · General", tone: "Direct, confident", engine: "edge" },
    ],
  },
  quechua: {
    female: [{ id: "qu+f3", name: "Quechua F3", role: "Offline · Formant", tone: "eSpeak NG variant", engine: "espeak" }],
    male: [{ id: "qu+m3", name: "Quechua M3", role: "Offline · Formant", tone: "eSpeak NG variant", engine: "espeak" }],
  },
  aymara: {
    female: [{ id: "facebook/mms-tts-ayr", name: "Central Aymara", role: "Offline · Neural", tone: "Single-speaker MMS model", engine: "mms" }],
    male: [{ id: "facebook/mms-tts-ayr", name: "Central Aymara", role: "Offline · Neural", tone: "Single-speaker MMS model", engine: "mms" }],
  },
  guarani: {
    female: [{ id: "gn+f3", name: "Guarani F3", role: "Offline · Formant", tone: "eSpeak NG variant", engine: "espeak" }],
    male: [{ id: "gn+m3", name: "Guarani M3", role: "Offline · Formant", tone: "eSpeak NG variant", engine: "espeak" }],
  },
  japanese: {
    female: [{ id: "ja-JP-NanamiNeural", name: "Nanami", role: "Japan · General", tone: "Clear, natural", engine: "edge" }],
    male: [{ id: "ja-JP-KeitaNeural", name: "Keita", role: "Japan · General", tone: "Steady, warm", engine: "edge" }],
  },
  thai: {
    female: [{ id: "th-TH-PremwadeeNeural", name: "Premwadee", role: "Thailand · General", tone: "Friendly, composed", engine: "edge" }],
    male: [{ id: "th-TH-NiwatNeural", name: "Niwat", role: "Thailand · General", tone: "Natural, confident", engine: "edge" }],
  },
  korean: {
    female: [{ id: "ko-KR-SunHiNeural", name: "SunHi", role: "Korea · General", tone: "Bright, clear", engine: "edge" }],
    male: [{ id: "ko-KR-InJoonNeural", name: "InJoon", role: "Korea · General", tone: "Calm, articulate", engine: "edge" }],
  },
  hindi: {
    female: [{ id: "hi-IN-SwaraNeural", name: "Swara", role: "India · General", tone: "Warm, natural", engine: "edge" }],
    male: [{ id: "hi-IN-MadhurNeural", name: "Madhur", role: "India · General", tone: "Clear, assured", engine: "edge" }],
  },
  arabic: {
    female: [{ id: "ar-SA-ZariyahNeural", name: "Zariyah", role: "Saudi Arabia · General", tone: "Elegant, clear", engine: "edge" }],
    male: [{ id: "ar-SA-HamedNeural", name: "Hamed", role: "Saudi Arabia · General", tone: "Measured, authoritative", engine: "edge" }],
  },
  french: {
    female: [{ id: "fr-FR-DeniseNeural", name: "Denise", role: "France · General", tone: "Warm, articulate", engine: "edge" }],
    male: [{ id: "fr-FR-HenriNeural", name: "Henri", role: "France · General", tone: "Refined, steady", engine: "edge" }],
  },
};

export const STYLE_PRESETS = [
  { id: "news", label: "News Anchor", description: "Clear, assured", rate: 0.98, pitch: 0, volume: 100, pause: 0.28 },
  { id: "story", label: "Storyteller", description: "Immersive, rhythmic", rate: 0.9, pitch: -2, volume: 98, pause: 0.52 },
  { id: "calm", label: "Calm", description: "Gentle, grounded", rate: 0.84, pitch: -1, volume: 92, pause: 0.62 },
  { id: "energetic", label: "Energetic", description: "Vivid, expressive", rate: 1.08, pitch: 2, volume: 106, pause: 0.18 },
] as const;

export type VoiceStyle = (typeof STYLE_PRESETS)[number]["id"];

export const DEFAULT_VOICE: Record<StudioLanguage, Record<VoiceGender, string>> = Object.fromEntries(
  (Object.keys(VOICE_CATALOG) as StudioLanguage[]).map(language => [
    language,
    {
      female: VOICE_CATALOG[language].female[0].id,
      male: VOICE_CATALOG[language].male[0].id,
    },
  ]),
) as Record<StudioLanguage, Record<VoiceGender, string>>;
