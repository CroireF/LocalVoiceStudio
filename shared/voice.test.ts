import { describe, expect, it } from "vitest";
import { createAutoPreviewSequencer, DEFAULT_SCRIPT, DEFAULT_VOICE, isLatestPreviewRequest, LANGUAGE_OPTIONS, prepareBatchJobs, STYLE_PRESETS, VOICE_CATALOG } from "./voice";

describe("VoiceStudio voice catalog", () => {
  it("prioritizes English, Spanish, Mandarin, and Cantonese in the language selector", () => {
    expect(LANGUAGE_OPTIONS.slice(0, 4).map(language => language.id)).toEqual(["english", "spanish", "mandarin", "cantonese"]);
  });

  it("covers every supported language with named female and male presets", () => {
    expect(LANGUAGE_OPTIONS).toHaveLength(13);
    for (const language of LANGUAGE_OPTIONS) {
      expect(VOICE_CATALOG[language.id].female.length).toBeGreaterThan(0);
      expect(VOICE_CATALOG[language.id].male.length).toBeGreaterThan(0);
      expect(VOICE_CATALOG[language.id].female.some(voice => voice.id === DEFAULT_VOICE[language.id].female)).toBe(true);
      expect(VOICE_CATALOG[language.id].male.some(voice => voice.id === DEFAULT_VOICE[language.id].male)).toBe(true);
      expect(VOICE_CATALOG[language.id].female.every(voice => ["edge", "espeak", "mms"].includes(voice.engine))).toBe(true);
    }
  });

  it("maps every language to a non-empty default script", () => {
    for (const language of LANGUAGE_OPTIONS) {
      expect(DEFAULT_SCRIPT[language.id].trim().length).toBeGreaterThan(8);
    }
    expect(DEFAULT_SCRIPT.english).toContain("first light of morning");
    expect(DEFAULT_SCRIPT.mandarin).toContain("清晨");
    expect(DEFAULT_SCRIPT.cantonese).toContain("清晨");
  });

  it("uses line breaks as independent jobs only when batch segmentation is enabled", () => {
    const script = "First line\n\nSecond line";
    expect(prepareBatchJobs(script, false)).toEqual(["First line\n\nSecond line"]);
    expect(prepareBatchJobs(script, true)).toEqual(["First line", "Second line"]);
    expect(prepareBatchJobs("\n\n", true)).toEqual([]);
  });

  it("accepts only the latest automatic performance-preview request", () => {
    expect(isLatestPreviewRequest(4, 4)).toBe(true);
    expect(isLatestPreviewRequest(3, 4)).toBe(false);
  });

  it("prevents a stale parameter-preview response from overwriting the newest response", () => {
    const sequencer = createAutoPreviewSequencer();
    const pitchChangeRequest = sequencer.issue();
    const rateChangeRequest = sequencer.issue();
    const appliedResponses: string[] = [];
    if (sequencer.accepts(rateChangeRequest)) appliedResponses.push("rate-change");
    if (sequencer.accepts(pitchChangeRequest)) appliedResponses.push("pitch-change");
    expect(appliedResponses).toEqual(["rate-change"]);
  });

  it("assigns documented local fallback engines for low-resource languages", () => {
    expect(VOICE_CATALOG.quechua.female[0].engine).toBe("espeak");
    expect(VOICE_CATALOG.guarani.male[0].engine).toBe("espeak");
    expect(VOICE_CATALOG.aymara.female[0].engine).toBe("mms");
  });

  it("includes the four one-click performance styles with usable values", () => {
    expect(STYLE_PRESETS.map(style => style.label)).toEqual(["News Anchor", "Storyteller", "Calm", "Energetic"]);
    expect(STYLE_PRESETS.every(style => style.rate >= 0.7 && style.rate <= 1.3)).toBe(true);
    expect(STYLE_PRESETS.every(style => style.pause >= 0 && style.pause <= 1.2)).toBe(true);
  });
});
