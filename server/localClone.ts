import { spawn } from "child_process";
import { mkdir, readFile, rm, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { nanoid } from "nanoid";
import { ensureLocalVoiceDirectories, getAudioDirectory } from "./localVoice";
import type { CloneEngine } from "../shared/voice";

const LOCAL_DATA_DIR = path.join(process.cwd(), "local-data");
const REFERENCE_DIR = path.join(LOCAL_DATA_DIR, "references");
const WORK_DIR = path.join(LOCAL_DATA_DIR, "work");

const XTTS_LANGUAGE: Record<string, string> = {
  mandarin: "zh-cn",
  english: "en",
  spanish: "es",
  japanese: "ja",
  korean: "ko",
  hindi: "hi",
  arabic: "ar",
  french: "fr",
};

type ProcessResult = { stdout: string; stderr: string };

function run(command: string, args: string[]): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", data => { stdout += data.toString(); });
    child.stderr.on("data", data => { stderr += data.toString(); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${command} exited with ${code}: ${stderr || stdout}`)));
  });
}

function findPython() {
  const candidates = [
    process.env.VOICE_STUDIO_XTTS_PYTHON,
    path.join(process.cwd(), ".clone-venv", "bin", "python"),
    process.env.VOICE_STUDIO_PYTHON,
    path.join(process.cwd(), ".venv", "bin", "python"),
    "python3",
    "python",
  ].filter((item): item is string => Boolean(item));
  return candidates.find(candidate => candidate === "python3" || candidate === "python" || existsSync(candidate)) ?? "python3";
}

function findCosyVoicePython() {
  const candidates = [
    process.env.VOICE_STUDIO_COSYVOICE_PYTHON,
    path.join(process.cwd(), ".cosyvoice-venv", "bin", "python"),
  ].filter((item): item is string => Boolean(item));
  return candidates.find(existsSync) ?? "python3";
}

function getFfmpeg() {
  return process.env.VOICE_STUDIO_FFMPEG || "ffmpeg";
}

function parseDataUrl(dataUrl: string) {
  const match = /^data:audio\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/i.exec(dataUrl);
  if (!match) throw new Error("The reference recording must be a valid local audio data URL.");
  const extension = match[1].includes("wav") ? "wav" : match[1].includes("mp4") ? "m4a" : "webm";
  return { extension, data: Buffer.from(match[2], "base64") };
}

export async function saveCloneReference(dataUrl: string) {
  const parsed = parseDataUrl(dataUrl);
  if (parsed.data.length > 15 * 1024 * 1024) throw new Error("Reference recordings must be smaller than 15 MB.");
  await mkdir(REFERENCE_DIR, { recursive: true });
  const id = `reference-${Date.now()}-${nanoid(8)}`;
  const filePath = path.join(REFERENCE_DIR, `${id}.${parsed.extension}`);
  await writeFile(filePath, parsed.data);
  return { id, localOnly: true };
}

export async function generateLocalClone(input: { referenceId: string; text: string; language: string; engine?: CloneEngine; referenceText?: string; vocalize?: boolean }) {
  const text = input.text.trim();
  if (!text) throw new Error("Enter text before generating a cloned voice.");
  const engine = input.engine ?? "xtts-v2";
  const xttsLanguage = XTTS_LANGUAGE[input.language];
  const cosyVoiceLanguages = ["mandarin", "english", "cantonese", "spanish", "japanese", "korean", "french"];
  if (engine === "xtts-v2" && !xttsLanguage) throw new Error("The optional local XTTS clone runner does not support this language yet. Choose English, Mandarin, Spanish, Japanese, Korean, Hindi, Arabic, or French.");
  if (engine !== "xtts-v2" && !cosyVoiceLanguages.includes(input.language)) throw new Error("The optional local CosyVoice runner currently supports Mandarin, Cantonese, English, Spanish, Japanese, Korean, and French in VoiceStudio.");

  await ensureLocalVoiceDirectories();
  const matchingFile = ["webm", "wav", "m4a"].map(extension => path.join(REFERENCE_DIR, `${input.referenceId}.${extension}`)).find(existsSync);
  if (!matchingFile) throw new Error("The local reference recording was not found. Record a new local profile.");

  const id = `${Date.now()}-${nanoid(8)}`;
  const taskDir = path.join(WORK_DIR, `clone-${id}`);
  const outputDirectory = getAudioDirectory();
  const wavPath = path.join(outputDirectory, `voicestudio-clone-${id}.wav`);
  const mp3Path = path.join(outputDirectory, `voicestudio-clone-${id}.mp3`);
  const aacPath = path.join(outputDirectory, `voicestudio-clone-${id}.aac`);
  const referenceWav = path.join(taskDir, "reference.wav");
  await mkdir(taskDir, { recursive: true });

  try {
    await run(getFfmpeg(), ["-y", "-i", matchingFile, "-ac", "1", "-ar", engine === "xtts-v2" ? "24000" : "16000", referenceWav]);
    if (engine === "xtts-v2") {
      await run(findPython(), [path.join(process.cwd(), "scripts", "xtts_clone.py"), "--reference", referenceWav, "--text", text, "--language", xttsLanguage!, "--output", wavPath]);
    } else {
      await run(findCosyVoicePython(), [path.join(process.cwd(), "scripts", "cosyvoice_clone.py"), "--reference", referenceWav, "--reference-text", input.referenceText?.trim() || "This is my local VoiceStudio reference.", "--text", text, "--model", engine, "--output", wavPath, ...(input.vocalize ? ["--vocalize"] : [])]);
    }
    await Promise.all([
      run(getFfmpeg(), ["-y", "-i", wavPath, "-c:a", "libmp3lame", "-b:a", "64k", mp3Path]),
      run(getFfmpeg(), ["-y", "-i", wavPath, "-c:a", "aac", "-b:a", "128k", aacPath]),
    ]);
    const metadata = await readFile(wavPath);
    return {
      id,
      duration: Math.max(1, Number((metadata.length / (24000 * 2)).toFixed(1))),
      audioUrl: `/local-audio/${path.basename(mp3Path)}`,
      downloads: { mp3: `/local-audio/${path.basename(mp3Path)}`, wav: `/local-audio/${path.basename(wavPath)}`, aac: `/local-audio/${path.basename(aacPath)}` },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("requires a user-reviewed Coqui Public Model License")) {
      throw new Error("The optional local clone model requires you to review and accept its Coqui Public Model License before the first download. Start VoiceStudio with COQUI_TOS_AGREED=1 after reviewing the terms.");
    }
    if (message.includes("Weights only load failed")) {
      throw new Error("The installed PyTorch version is incompatible with XTTS-v2 checkpoint loading. Re-run `pnpm voice:setup:clone` to install the supported PyTorch 2.5.1 runtime, then restart VoiceStudio.");
    }
    if (message.includes("_aoti_torch_abi_version")) {
      throw new Error("PyTorch and torchaudio versions do not match. Re-run `pnpm voice:setup:clone` to install the paired torch and torchaudio 2.5.1 runtime, then restart VoiceStudio.");
    }
    if (message.includes("CosyVoice runtime") || message.includes("CosyVoice model files")) {
      throw new Error("The optional local CosyVoice engine is not ready. Follow the CosyVoice setup in README.md, then set VOICE_STUDIO_COSYVOICE_DIR and VOICE_STUDIO_COSYVOICE_PYTHON.");
    }
    if (message.includes("Optional XTTS dependency missing") || message.includes("No module named") || message.includes("ENOENT")) {
      throw new Error("The optional local clone engine is not ready. Run: pnpm voice:setup:clone");
    }
    throw new Error(`Local clone generation failed. ${message.slice(0, 180)}`);
  } finally {
    await rm(taskDir, { recursive: true, force: true });
  }
}
