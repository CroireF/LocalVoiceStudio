# Multilingual voice support

VoiceStudio now supports thirteen languages through a local-first engine matrix. Edge Neural voices remain the default where available. Quechua and Guarani use the free, offline eSpeak NG fallback. Central Aymara uses the local MMS-TTS neural checkpoint because neither the installed Edge voice catalog nor eSpeak NG provides an Aymara voice.[1] [2]

| Language | Engine | Default female preset | Default male preset | Connection requirement |
|---|---|---|---|---|
| Mandarin | Edge Neural | Xiaoxiao | Yunxi | Internet during synthesis |
| English | Edge Neural | Aria | Christopher | Internet during synthesis |
| Cantonese | Edge Neural | HiuMaan | WanLung | Internet during synthesis |
| Spanish | Edge Neural | Elvira | Alvaro | Internet during synthesis |
| Quechua | eSpeak NG | Quechua F3 | Quechua M3 | Fully offline after eSpeak NG installation |
| Central Aymara | MMS-TTS | Central Aymara | Central Aymara | Model download on first run, then local inference |
| Guarani | eSpeak NG | Guarani F3 | Guarani M3 | Fully offline after eSpeak NG installation |
| Japanese | Edge Neural | Nanami | Keita | Internet during synthesis |
| Thai | Edge Neural | Premwadee | Niwat | Internet during synthesis |
| Korean | Edge Neural | SunHi | InJoon | Internet during synthesis |
| Hindi | Edge Neural | Swara | Madhur | Internet during synthesis |
| Arabic | Edge Neural | Zariyah | Hamed | Internet during synthesis |
| French | Edge Neural | Denise | Henri | Internet during synthesis |

## Setup for all languages

The standard setup installs edge-tts. To use Quechua or Guarani, install eSpeak NG. To use Central Aymara, install the optional MMS Python stack. macOS users can run:

```bash
brew install espeak-ng
pnpm voice:setup:extended
```

The first Aymara render downloads the `facebook/mms-tts-ayr` model. Later renders use the locally cached model. MMS is intentionally exposed as a single-speaker model, so its female and male buttons select the same available model rather than claiming unavailable gender-specific voices.

## Quality and licensing notes

Edge Neural usually provides the most natural output but requires network access to the Edge online voice service. eSpeak NG is compact and fully offline, but uses formant synthesis and is less natural than recording-based neural voices.[1] MMS-TTS generates neural speech locally, but the Central Aymara checkpoint is licensed **CC-BY-NC 4.0**; do not use that model for commercial purposes without reviewing and complying with its license.[3]

## Commit the multilingual update

After reviewing the working tree, commit the synchronized local project changes and push them to GitHub:

```bash
cd /Users/fanrongqing/Desktop/Manusworkspace/voicestudio
git add CONTRIBUTING.md README.md client/src/pages/Home.tsx docs package.json requirements-extended.txt scripts server shared todo.md
git commit -m "feat: add multilingual voice support"
git push
```

The current project state has passed the standard test suite and type check. To rerun the already-installed optional Central Aymara integration test, use `RUN_MMS_INTEGRATION=1 pnpm vitest run server/localVoice.mms.integration.test.ts`.

## References

[1] [eSpeak NG project and language support](https://github.com/espeak-ng/espeak-ng)

[2] [eSpeak NG language list](https://github.com/espeak-ng/espeak-ng/blob/master/docs/languages.md)

[3] [MMS-TTS Central Aymara model card](https://huggingface.co/facebook/mms-tts-ayr)

[4] [Hugging Face MMS TTS documentation](https://huggingface.co/docs/transformers/en/model_doc/mms)
