import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { generateLocalClone, saveCloneReference } from "./localClone";
import { generateLocalHumming } from "./localHumming";
import { generateLocalVoice } from "./localVoice";
import { publicProcedure, router } from "./_core/trpc";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  voice: router({
    generate: publicProcedure
      .input(z.object({
        text: z.string().min(1).max(3000),
        language: z.enum(["mandarin", "english", "cantonese", "spanish", "quechua", "aymara", "guarani", "japanese", "thai", "korean", "hindi", "arabic", "french"]),
        gender: z.enum(["female", "male"]),
        voiceId: z.string().min(3).max(120),
        engine: z.enum(["edge", "espeak", "mms"]),
        style: z.enum(["news", "story", "calm", "energetic"]),
        rate: z.number().min(0.7).max(1.3),
        pitch: z.number().min(-12).max(12),
        volume: z.number().min(60).max(120),
        pause: z.number().min(0).max(1.2),
      }))
      .mutation(({ input }) => generateLocalVoice(input)),
  }),
  humming: router({
    generate: publicProcedure
      .input(z.object({
        text: z.string().min(1).max(1000),
        mode: z.enum(["random", "guided"]),
        mood: z.string().min(1).max(40),
        bpm: z.number().min(55).max(160),
        style: z.string().min(1).max(40),
        gender: z.enum(["female", "male"]),
        baseFrequency: z.number().min(110).max(440),
        pitch: z.number().min(-12).max(12),
        volume: z.number().min(30).max(120),
        contour: z.array(z.number().min(-24).max(24)).min(1).max(48).optional(),
        engine: z.enum(["local-hum", "cosyvoice2", "cosyvoice3"]).default("local-hum"),
        referenceId: z.string().min(12).max(100).optional(),
        referenceText: z.string().min(1).max(1200).optional(),
        language: z.enum(["mandarin", "english", "cantonese", "spanish", "quechua", "aymara", "guarani", "japanese", "thai", "korean", "hindi", "arabic", "french"]).default("english"),
      }))
      .mutation(({ input }) => generateLocalHumming(input)),
  }),
  clone: router({
    captureReference: publicProcedure
      .input(z.object({ dataUrl: z.string().min(40).max(20_000_000) }))
      .mutation(({ input }) => saveCloneReference(input.dataUrl)),
    generate: publicProcedure
      .input(z.object({
        referenceId: z.string().min(12).max(100),
        text: z.string().min(1).max(1200),
        language: z.enum(["mandarin", "english", "cantonese", "spanish", "japanese", "korean", "hindi", "arabic", "french"]),
        engine: z.enum(["xtts-v2", "cosyvoice2", "cosyvoice3"]).default("xtts-v2"),
        referenceText: z.string().min(1).max(1200).default("This is my local VoiceStudio reference."),
      }))
      .mutation(({ input }) => generateLocalClone(input)),
  }),
});

export type AppRouter = typeof appRouter;
