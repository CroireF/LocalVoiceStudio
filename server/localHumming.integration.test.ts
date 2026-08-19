import { access, rm, stat } from "fs/promises";
import path from "path";
import { afterAll, describe, expect, it } from "vitest";
import { getAudioDirectory } from "./localVoice";
import { generateLocalHumming } from "./localHumming";

const createdFiles: string[] = [];

afterAll(async () => {
  await Promise.all(createdFiles.map(file => rm(file, { force: true })));
});

describe("local humming pipeline", () => {
  it("creates a deterministic local humming preview with MP3, WAV, and AAC exports", async () => {
    const result = await generateLocalHumming({
      text: "A hopeful local humming motif.",
      mode: "random",
      mood: "Hopeful",
      bpm: 92,
      style: "Ambient",
      gender: "female",
      baseFrequency: 220,
      pitch: 0,
      volume: 85,
    });
    const files = Object.values(result.downloads).map(url => path.join(getAudioDirectory(), path.basename(url)));
    createdFiles.push(...files);
    await Promise.all(files.map(file => access(file)));
    const sizes = await Promise.all(files.map(file => stat(file).then(metadata => metadata.size)));
    expect(result.duration).toBeGreaterThan(0);
    expect(result.audioUrl).toBe(result.downloads.mp3);
    expect(sizes.every(size => size > 512)).toBe(true);
  }, 60_000);
});
