import { access, readFile, rm, stat } from "fs/promises";
import path from "path";
import { afterAll, describe, expect, it } from "vitest";
import { generateLocalClone, saveCloneReference } from "./localClone";
import { generateLocalVoice, getAudioDirectory } from "./localVoice";

const createdFiles: string[] = [];
const runXttsIntegration = process.env.RUN_XTTS_INTEGRATION === "1" && process.env.COQUI_TOS_AGREED === "1";

afterAll(async () => {
  await Promise.all(createdFiles.map(file => rm(file, { force: true })));
});

describe.skipIf(!runXttsIntegration)("optional local XTTS-v2 clone pipeline", () => {
  it("saves a local reference and produces MP3, WAV, and AAC clone exports", async () => {
    const referenceRender = await generateLocalVoice({
      text: "This is a local VoiceStudio reference recording for clone pipeline verification.",
      language: "english",
      gender: "female",
      voiceId: "en-US-AriaNeural",
      engine: "edge",
      style: "calm",
      rate: 0.9,
      pitch: 0,
      volume: 100,
      pause: 0.2,
    });

    const referenceWav = path.join(getAudioDirectory(), path.basename(referenceRender.downloads.wav));
    const referenceBytes = await readFile(referenceWav);
    const reference = await saveCloneReference(`data:audio/wav;base64,${referenceBytes.toString("base64")}`);
    const storedReference = path.join(process.cwd(), "local-data", "references", `${reference.id}.wav`);
    createdFiles.push(referenceWav, storedReference);

    const result = await generateLocalClone({
      referenceId: reference.id,
      text: "VoiceStudio verified an optional local XTTS clone render.",
      language: "english",
    });

    const outputFiles = [result.downloads.mp3, result.downloads.wav, result.downloads.aac]
      .map(url => path.join(getAudioDirectory(), path.basename(url)));
    createdFiles.push(...outputFiles);
    await Promise.all(outputFiles.map(file => access(file)));
    const sizes = await Promise.all(outputFiles.map(file => stat(file).then(metadata => metadata.size)));

    expect(result.audioUrl).toBe(result.downloads.mp3);
    expect(result.duration).toBeGreaterThan(0);
    expect(sizes.every(size => size > 512)).toBe(true);
  }, 1_200_000);
});
