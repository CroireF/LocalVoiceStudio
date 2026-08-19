// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mutationCalls: Array<{ input: unknown; options?: { onSuccess?: (result: any) => void } }> = [];
const mutate = vi.fn((input: unknown, options?: { onSuccess?: (result: any) => void }) => {
  mutationCalls.push({ input, options });
});
const speak = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    voice: { generate: { useMutation: () => ({ mutate, isPending: false }) } },
    humming: { generate: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) } },
    clone: {
      captureReference: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
      generate: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) },
    },
  },
}));

import Home from "./Home";

const result = (id: string) => ({
  id,
  duration: 2,
  audioUrl: `/${id}.mp3`,
  downloads: { mp3: `/${id}.mp3`, wav: `/${id}.wav`, aac: `/${id}.aac` },
});

describe("Batch Text performance auto preview", () => {
  beforeEach(() => {
    mutationCalls.length = 0;
    mutate.mockClear();
    vi.useFakeTimers();
    window.history.pushState({}, "", "/create-voice/batch");
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        cancel: vi.fn(),
        speak,
        getVoices: () => [
          { name: "Aria Local", lang: "en-US" },
          { name: "Jenny Local", lang: "en-US" },
          { name: "Emma Local", lang: "en-US" },
        ],
      },
    });
    Object.defineProperty(globalThis, "SpeechSynthesisUtterance", {
      configurable: true,
      value: class SpeechSynthesisUtterance {
        text: string;
        lang = "";
        rate = 1;
        pitch = 1;
        volume = 1;
        voice: { name: string; lang: string } | null = null;
        constructor(text: string) {
          this.text = text;
        }
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    speak.mockClear();
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("keeps Line-break output manual and applies only the newest debounced performance preview", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("switch"));
    expect(mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Pitch"), { target: { value: "2" } });
    act(() => vi.advanceTimersByTime(700));
    expect(mutationCalls).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Speed / Rate"), { target: { value: "1.05" } });
    act(() => vi.advanceTimersByTime(700));
    expect(mutationCalls).toHaveLength(2);

    act(() => mutationCalls[0].options?.onSuccess?.(result("stale")));
    act(() => vi.advanceTimersByTime(70));
    expect(document.querySelector("audio")?.src).not.toContain("stale.mp3");

    act(() => mutationCalls[1].options?.onSuccess?.(result("latest")));
    act(() => vi.advanceTimersByTime(70));
    expect(document.querySelector("audio")?.src).toContain("latest.mp3");
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  it("routes a selected Voice direction preset into the local preview generation request", () => {
    render(<Home />);

    fireEvent.click(screen.getByRole("button", { name: /Jenny/i }));
    act(() => vi.advanceTimersByTime(700));

    expect(mutationCalls).toHaveLength(1);
    expect(mutationCalls[0].input).toMatchObject({ voiceId: "en-US-JennyNeural", engine: "edge" });
  });

  it("labels the live output as Live preview and changes the browser audition voice with Voice direction", () => {
    window.history.pushState({}, "", "/create-voice/live-preview");
    render(<Home />);
    expect(screen.getByText("Live preview", { selector: "p" })).toBeTruthy();
    expect(screen.getByText("Render language")).toBeTruthy();
    expect(screen.getByText("Performance style")).toBeTruthy();

    act(() => vi.advanceTimersByTime(650));
    speak.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Jenny/i }));
    act(() => vi.advanceTimersByTime(650));

    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0].voice?.name).toBe("Jenny Local");
  });

  it("uses Wand Sparkles for Create Humming and supplies an English default preview across output workspaces", () => {
    const defaultEnglishText = "In the first light of morning, every story can find a voice of its own.";
    const routes = ["/create-voice/batch", "/create-voice/live-preview", "/create-voice/clone", "/create-humming/text-hum"];

    for (const route of routes) {
      window.history.pushState({}, "", route);
      const view = render(<Home />);
      expect(screen.getAllByText(defaultEnglishText).some(node => node.closest(".output-preview"))).toBe(true);
      expect(screen.getByText("English text-to-speech preview")).toBeTruthy();
      view.unmount();
    }

    window.history.pushState({}, "", "/create-humming");
    render(<Home />);
    expect(document.querySelector("svg.lucide-wand-sparkles")).toBeTruthy();

    window.history.pushState({}, "", "/create-voice/batch");
    cleanup();
    render(<Home />);
    fireEvent.click(screen.getByRole("button", { name: "Play English text-to-speech preview" }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak.mock.calls[0]?.[0].text).toBe(defaultEnglishText);
    expect(speak.mock.calls[0]?.[0].lang).toBe("en-US");
  });
});
