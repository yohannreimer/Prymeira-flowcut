import json
import sys

try:
    from faster_whisper import WhisperModel
except ModuleNotFoundError:
    print(
        "faster-whisper is not installed. Install with: python3 -m pip install faster-whisper",
        file=sys.stderr,
    )
    sys.exit(127)


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: transcribe_faster_whisper.py <media-path> [model-size]", file=sys.stderr)
        return 2

    media_path = sys.argv[1]
    model_size = sys.argv[2] if len(sys.argv) > 2 else "base"
    model = WhisperModel(model_size, device="auto", compute_type="auto")
    segments, info = model.transcribe(media_path, vad_filter=True, word_timestamps=False)
    print(json.dumps({
        "language": info.language,
        "segments": [
            {"startSec": segment.start, "endSec": segment.end, "text": segment.text.strip()}
            for segment in segments
            if segment.text.strip()
        ],
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
