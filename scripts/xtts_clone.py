import argparse
import os
import sys
from pathlib import Path


MODEL_CACHE = Path.home() / ".local" / "share" / "tts" / "tts_models--multilingual--multi-dataset--xtts_v2"


def main():
    parser = argparse.ArgumentParser(description="Run an optional local XTTS voice-clone render.")
    parser.add_argument("--reference", required=True)
    parser.add_argument("--text", required=True)
    parser.add_argument("--language", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    if os.environ.get("COQUI_TOS_AGREED") != "1" and not (MODEL_CACHE / "tos_agreed.txt").exists():
        print(
            "XTTS-v2 requires a user-reviewed Coqui Public Model License before its first model download. "
            "After reviewing the terms, start VoiceStudio with COQUI_TOS_AGREED=1 so the local model can be downloaded.",
            file=sys.stderr,
        )
        raise SystemExit(3)

    try:
        import torch
        from TTS.api import TTS
    except ModuleNotFoundError as error:
        print(f"Optional XTTS dependency missing: {error}", file=sys.stderr)
        raise SystemExit(2)

    if torch.cuda.is_available():
        device = "cuda"
    elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
    tts.tts_to_file(
        text=args.text,
        file_path=args.output,
        speaker_wav=args.reference,
        language=args.language,
    )


if __name__ == "__main__":
    main()
