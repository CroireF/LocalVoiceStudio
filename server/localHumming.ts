import { spawn } from "child_process";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import { nanoid } from "nanoid";
import type { HummingEngine, StudioLanguage, VoiceGender } from "../shared/voice";
import { ensureLocalVoiceDirectories, getAudioDirectory } from "./localVoice";
import { generateLocalClone } from "./localClone";

const WORK_DIR = path.join(process.cwd(), "local-data", "work");

export type LocalHummingRequest = {
  text: string;
  mode: "random" | "guided";
  mood: string;
  bpm: number;
  style: string;
  gender: VoiceGender;
  baseFrequency: number;
  pitch: number;
  volume: number;
  contour?: number[];
  engine?: HummingEngine;
  referenceId?: string;
  referenceText?: string;
  language?: StudioLanguage;
};

function getFfmpeg() {
  return process.env.VOICE_STUDIO_FFMPEG || "ffmpeg";
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stderr = "";
    child.stderr.on("data", data => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}: ${stderr}`)));
  });
}

function quoteForConcat(filePath: string) {
  return `file '${filePath.replace(/'/g, "'\\''")}'`;
}

function deriveContour(text: string, mood: string, count: number) {
  const seed = Array.from(`${text}:${mood}`).reduce((total, character, index) => total + character.codePointAt(0)! * (index + 11), 0);
  const moodScale: Record<string, number[]> = {
    Hopeful: [0, 2, 4, 7, 9],
    Dreamy: [0, 3, 5, 7, 10],
    Playful: [0, 4, 7, 9, 12],
    Focused: [0, 2, 5, 7, 9],
  };
  const scale = moodScale[mood] ?? moodScale.Hopeful;
  return Array.from({ length: count }, (_, index) => scale[(seed + index * 3) % scale.length] ?? 0);
}

export async function generateLocalHumming(input: LocalHummingRequest) {
  const text = input.text.trim();
  if (!text) throw new Error("Enter text before generating a humming preview.");
  if (text.length > 1000) throw new Error("Local humming supports up to 1,000 characters per request.");

  if (input.engine && input.engine !== "local-hum") {
    if (!input.referenceId) throw new Error("Record a local voice reference before using the optional CosyVoice text-hum engine.");
    return generateLocalClone({
      referenceId: input.referenceId,
      referenceText: input.referenceText,
      text,
      language: input.language ?? "english",
      engine: input.engine,
      vocalize: true,
    });
  }

  await ensureLocalVoiceDirectories();
  const id = `${Date.now()}-${nanoid(8)}`;
  const taskDir = path.join(WORK_DIR, `humming-${id}`);
  const audioDirectory = getAudioDirectory();
  const mp3File = `voicestudio-hum-${id}.mp3`;
  const wavFile = `voicestudio-hum-${id}.wav`;
  const aacFile = `voicestudio-hum-${id}.aac`;
  const mp3Path = path.join(audioDirectory, mp3File);
  const wavPath = path.join(audioDirectory, wavFile);
  const aacPath = path.join(audioDirectory, aacFile);
  const noteCount = Math.min(16, Math.max(4, Math.ceil(Array.from(text).length / 7)));
  const contour = input.mode === "guided" && input.contour?.length ? input.contour : deriveContour(text, input.mood, noteCount);
  const noteDuration = Math.max(0.18, Math.min(1.1, (60 / input.bpm) * 0.72));
  const genderOffset = input.gender === "female" ? 5 : -5;
  const sourceFiles: string[] = [];

  await mkdir(taskDir, { recursive: true });
  try {
    for (let index = 0; index < noteCount; index += 1) {
      const interval = contour[index % contour.length] ?? 0;
      const frequency = Math.max(70, Math.min(880, input.baseFrequency * 2 ** ((interval + input.pitch + genderOffset) / 12)));
      const notePath = path.join(taskDir, `note-${index}.mp3`);
      const amplitude = Math.max(0.04, Math.min(0.42, input.volume / 270));
      const fadeOutStart = Math.max(0, noteDuration - 0.06);
      const expression = `${amplitude.toFixed(3)}*sin(2*PI*${frequency.toFixed(3)}*t)+${(amplitude * 0.18).toFixed(3)}*sin(2*PI*${(frequency * 2).toFixed(3)}*t)`;
      try {
        await run(getFfmpeg(), [
          "-y", "-f", "lavfi", "-t", noteDuration.toFixed(3), "-i", `aevalsrc=${expression}:s=24000`,
          "-af", `afade=t=in:st=0:d=0.035,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=0.06`,
          "-c:a", "libmp3lame", "-b:a", "64k", notePath,
        ]);
      } catch {
        throw new Error("FFmpeg was not found. Install FFmpeg before using Create humming.");
      }
      sourceFiles.push(notePath);
    }

    const concatList = path.join(taskDir, "concat.txt");
    await writeFile(concatList, sourceFiles.map(quoteForConcat).join("\n"), "utf8");
    await run(getFfmpeg(), ["-y", "-f", "concat", "-safe", "0", "-i", concatList, "-c:a", "libmp3lame", "-b:a", "64k", mp3Path]);
    await Promise.all([
      run(getFfmpeg(), ["-y", "-i", mp3Path, "-c:a", "pcm_s16le", wavPath]),
      run(getFfmpeg(), ["-y", "-i", mp3Path, "-c:a", "aac", "-b:a", "128k", aacPath]),
    ]);

    return {
      id,
      duration: Number((noteCount * noteDuration).toFixed(1)),
      audioUrl: `/local-audio/${mp3File}`,
      downloads: { mp3: `/local-audio/${mp3File}`, wav: `/local-audio/${wavFile}`, aac: `/local-audio/${aacFile}` },
    };
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
}
