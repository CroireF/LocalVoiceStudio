import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const emptyContext = {
  user: null,
  req: {},
  res: {},
} as TrpcContext;

describe("voice.generate", () => {
  it("rejects scripts over the local generation limit before invoking edge-tts", async () => {
    const caller = appRouter.createCaller(emptyContext);
    await expect(caller.voice.generate({
      text: "x".repeat(3001),
      language: "mandarin",
      gender: "female",
      voiceId: "zh-CN-XiaoxiaoNeural",
      engine: "edge",
      style: "news",
      rate: 0.98,
      pitch: 0,
      volume: 100,
      pause: 0.28,
    })).rejects.toThrow();
  });
});

describe("humming.generate", () => {
  it("rejects a humming request outside the supported local BPM range", async () => {
    const caller = appRouter.createCaller(emptyContext);
    await expect(caller.humming.generate({
      text: "A local humming phrase",
      mode: "random",
      mood: "Hopeful",
      bpm: 34,
      style: "Ambient",
      gender: "female",
      baseFrequency: 220,
      pitch: 0,
      volume: 85,
    })).rejects.toThrow();
  });
});

describe("clone.generate", () => {
  it("rejects a language that the optional local XTTS runner does not expose", async () => {
    const caller = appRouter.createCaller(emptyContext);
    await expect(caller.clone.generate({
      referenceId: "reference-12345678",
      text: "A local cloned render",
      language: "quechua" as never,
    })).rejects.toThrow();
  });
});
