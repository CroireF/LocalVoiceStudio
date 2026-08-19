import argparse
import os
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description="Run an optional local CosyVoice 2/3 zero-shot render.")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--reference-text", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--model", choices=["cosyvoice2", "cosyvoice3"], required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--vocalize", action="store_true")
    args = parser.parse_args()

    cosy_root = os.environ.get("VOICE_STUDIO_COSYVOICE_DIR")
    if not cosy_root:
        print("CosyVoice runtime is not configured. Set VOICE_STUDIO_COSYVOICE_DIR to an official local CosyVoice checkout.", file=sys.stderr)
        raise SystemExit(2)

    root = Path(cosy_root).expanduser().resolve()
    model_name = "CosyVoice2-0.5B" if args.model == "cosyvoice2" else "Fun-CosyVoice3-0.5B"
    model_dir = Path(os.environ.get("VOICE_STUDIO_COSYVOICE_MODEL_DIR", root / "pretrained_models" / model_name)).expanduser()
    if not model_dir.exists():
        print(f"CosyVoice model files are missing at {model_dir}. Download the official {model_name} files first.", file=sys.stderr)
        raise SystemExit(2)

    sys.path.insert(0, str(root))
    sys.path.append(str(root / "third_party" / "Matcha-TTS"))
    try:
        import torchaudio
        from cosyvoice.cli.cosyvoice import AutoModel
    except ModuleNotFoundError as error:
        print(f"CosyVoice runtime dependency missing: {error}", file=sys.stderr)
        raise SystemExit(2)

    model = AutoModel(model_dir=str(model_dir))
    if args.vocalize:
        instruction = "You are a helpful assistant. Render the supplied text as a gentle unaccompanied vocal hum, with no instrumental accompaniment.<|endofprompt|>"
        outputs = model.inference_instruct2(args.text, instruction, args.reference, stream=False)
    else:
        outputs = model.inference_zero_shot(args.text, args.reference_text, args.reference, stream=False)

    for output in outputs:
        torchaudio.save(args.output, output["tts_speech"], model.sample_rate)
        return
    raise RuntimeError("CosyVoice returned no audio output.")


if __name__ == "__main__":
    main()
