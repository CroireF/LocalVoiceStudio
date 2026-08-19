# CosyVoice Local Integration Notes

VoiceStudio treats CosyVoice as an **optional, user-installed local engine**. The official CosyVoice repository documents local inference, while the official CosyVoice 2 and Fun-CosyVoice 3 model cards describe multilingual zero-shot synthesis and reference-audio workflows.[1] [2] [3]

| VoiceStudio option | Official local model directory | Intended local workflow |
| --- | --- | --- |
| CosyVoice 2 | `FunAudioLLM/CosyVoice2-0.5B` | Reference-audio zero-shot rendering through `AutoModel.inference_zero_shot`. |
| CosyVoice 3 | `FunAudioLLM/Fun-CosyVoice3-0.5B-2512` | Reference-audio rendering and optional instruction-led vocalization through `AutoModel.inference_zero_shot` or `inference_instruct2`. |

The official setup instructions use a separate Python 3.10 environment, an official CosyVoice checkout, the project requirements, and locally downloaded model files. VoiceStudio therefore does not bundle repository code or model weights. Its optional runner requires a local checkout and explicit environment paths, so a missing setup fails with a clear local instruction instead of sending recordings to a third party.[1] [2] [3]

The repository code is distributed under Apache-2.0, but users must independently review the model card and any model-specific terms before downloading or using weights.[1] [4]

## References

[1] [Official CosyVoice repository](https://github.com/QwenAudio/CosyVoice)

[2] [CosyVoice 2 official model card](https://huggingface.co/FunAudioLLM/CosyVoice2-0.5B)

[3] [Fun-CosyVoice 3 official model card](https://huggingface.co/FunAudioLLM/Fun-CosyVoice3-0.5B-2512)

[4] [CosyVoice Apache-2.0 repository license](https://raw.githubusercontent.com/QwenAudio/CosyVoice/main/LICENSE)
