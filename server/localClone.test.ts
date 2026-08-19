import { rm } from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { generateLocalClone, saveCloneReference } from "./localClone";

const createdReferences: string[] = [];

function silentWavDataUrl() {
  const sampleRate = 8_000;
  const sampleCount = sampleRate / 4;
  const bytes = Buffer.alloc(44 + sampleCount * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(36 + sampleCount * 2, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(sampleCount * 2, 40);
  return `data:audio/wav;base64,${bytes.toString("base64")}`;
}

afterEach(async () => {
  await Promise.all(createdReferences.map(file => rm(file, { force: true })));
  createdReferences.length = 0;
});

describe("local clone reference storage", () => {
  it("stores a valid browser audio data URL under the local reference directory", async () => {
    const result = await saveCloneReference("data:audio/webm;base64,AAECAwQFBgcICQ==");
    createdReferences.push(path.join(process.cwd(), "local-data", "references", `${result.id}.webm`));
    expect(result.id).toMatch(/^reference-/);
    expect(result.localOnly).toBe(true);
  });

  it("rejects a non-audio data URL", async () => {
    await expect(saveCloneReference("data:text/plain;base64,SGVsbG8=")).rejects.toThrow("valid local audio data URL");
  });

  it("fails quickly with a license acknowledgement instruction before the optional model download", async () => {
    const reference = await saveCloneReference(silentWavDataUrl());
    createdReferences.push(path.join(process.cwd(), "local-data", "references", `${reference.id}.wav`));
    await expect(generateLocalClone({
      referenceId: reference.id,
      text: "A local clone request without an accepted model license.",
      language: "english",
    })).rejects.toThrow("review and accept its Coqui Public Model License");
  }, 30_000);
});
