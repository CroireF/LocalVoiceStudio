import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const emptyContext = { user: null, req: {}, res: {} } as TrpcContext;

describe("CosyVoice model contracts", () => {
  it("rejects XTTS-v2 from the text-humming engine selector", async () => {
    const caller = appRouter.createCaller(emptyContext);
    await expect(caller.humming.generate({
      text: "A local humming phrase",
      mode: "random",
      mood: "Hopeful",
      bpm: 96,
      style: "Ambient",
      gender: "female",
      baseFrequency: 220,
      pitch: 0,
      volume: 85,
      engine: "xtts-v2" as never,
    })).rejects.toThrow();
  });

  it("rejects unknown clone engines before a local model can run", async () => {
    const caller = appRouter.createCaller(emptyContext);
    await expect(caller.clone.generate({
      referenceId: "reference-12345678",
      text: "A local cloned render",
      language: "english",
      engine: "unsupported-engine" as never,
    })).rejects.toThrow();
  });
});
