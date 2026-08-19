# VoiceStudio Creation Suite Architecture

## Product boundary

VoiceStudio's new creation suite remains **local-first, free, and open-source by default**. The interactive application keeps recording data and generated artifacts in the local browser or the local project directory. It does not upload microphone recordings to a third-party service.

The suite separates low-latency previews from exportable renders. Live voice preview uses the browser's built-in speech synthesis where available and stores only local preview metadata. Exportable text-to-speech continues to use the existing local Edge/eSpeak/MMS pipeline. Humming is synthesized deterministically in the local Node.js process from melody data, then converted by local FFmpeg into MP3, WAV, and AAC.

## Feature implementation matrix

| Workspace | Mode | Default local implementation | Export behavior | Boundary |
|---|---|---|---|---|
| Create voice | Batch text | Existing edge-tts/eSpeak/MMS pipeline | MP3, WAV, AAC | A line-break switch either sends the whole script as one job or renders each non-empty line as a separate job. |
| Create voice | Live voice | Browser `SpeechSynthesis` with a local preview cache | Export only after an explicit Generate action | Browser voices differ from the selected neural export voice and are not persisted as audio files. |
| Create voice | Voice clone | Optional XTTS-v2 local runner with microphone reference capture | MP3, WAV, AAC after optional engine setup | Users must record the supplied consent text and affirm they have permission to use the voice. |
| Create humming | Random melody | Local deterministic hummed-tone synthesis | MP3, WAV, AAC | Creates a synthesized hum, not intelligible sung lyric generation. |
| Create humming | Melody-guided | Browser microphone pitch capture plus local hummed-tone synthesis | MP3, WAV, AAC | Replays captured pitch contour; it does not identify the performer or clone a singer. |

## Optional voice clone engine

The application exposes an optional XTTS-v2 setup path instead of including model weights in the repository. Its official model card documents local reference-audio voice cloning, multilingual rendering, and 17 target languages; the supplied local runner follows its documented `speaker_wav`, language, and file-output invocation.[1] The model is licensed under the Coqui Public Model License, so users must review that license before use, especially for commercial work.[1] The clone mode therefore shows a local-use and permission notice before recording. It must not be used for impersonation, fraud, or copying a person without authorization.

> Voice clone profiles are local reference recordings. The application must obtain an explicit acknowledgement that the user owns the voice or has the speaker's permission before allowing a profile to be saved or rendered.

## Optional advanced voice conversion

RVC is not bundled into the default application. Its documented workflow requires separate model assets and recommends at least ten minutes of low-noise speech for training; it is better suited to an advanced local setup than an instant browser recording flow.[2] The project will maintain the integration boundary but keep the default interface usable without a GPU, downloaded RVC models, or training data.

## References

[1] [XTTS-v2 official model card](https://huggingface.co/coqui/XTTS-v2)

[2] [RVC official repository](https://github.com/RVC-Project/Retrieval-based-Voice-Conversion-WebUI/blob/main/docs/en/README.en.md)
