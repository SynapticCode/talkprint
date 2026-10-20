"""Runs at image build time (CPU, no secrets) so cold starts skip these downloads.

Baked in: faster-whisper large-v3-turbo, the English alignment model, NLTK punkt_tab.
Not baked in: pyannote speaker-diarization-community-1. It is gated and needs HF_TOKEN,
which only exists at runtime on the endpoint. It is small and downloads on first load.
"""

import nltk
import whisperx

whisperx.load_model("large-v3-turbo", "cpu", compute_type="int8", download_root="/models/whisper")
whisperx.load_align_model("en", "cpu")
nltk.download("punkt_tab", download_dir="/models/nltk", quiet=True)
print("models cached")
