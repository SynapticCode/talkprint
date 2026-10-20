"""Talkprint Runpod Serverless worker.

Input (job["input"]):
  audio_url      signed URL to the recording (any format ffmpeg reads)
  voices         optional, up to 4: [{"name": "Ozzie", "url": "<signed URL to a voice sample>"}]
  language       optional ISO code ("en"); detected from the first 30 s when omitted
  min_speakers   optional int hint for diarization
  max_speakers   optional int hint for diarization

Output:
  { text, duration, language,
    segments: [{ speaker, start, end, text }],          # the contract in src/lib/types.ts
    speakers: [{ label, speaker, best_voice, score }] } # match scores, for tuning MATCH_THRESHOLD

Speakers that match a saved voice are labeled with its name; the rest are A, B, C in order of first speech.
"""

import os
import string
import tempfile

import numpy as np
import requests
import runpod
import torch
import whisperx
from whisperx.diarize import DiarizationPipeline

DEVICE = "cuda"
SAMPLE_RATE = 16000
MAX_VOICES = 4
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "large-v3-turbo")
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "16"))
# Cosine similarity a diarized speaker needs to take a saved voice's name. Starting value, not measured yet.
MATCH_THRESHOLD = float(os.environ.get("MATCH_THRESHOLD", "0.5"))
# Languages written without spaces between words.
NO_SPACE_LANGUAGES = {"zh", "ja", "th", "lo", "km", "my"}

# Loaded once per worker, outside the handler, so warm jobs skip model loading.
asr_model = whisperx.load_model(WHISPER_MODEL, DEVICE, compute_type="float16", download_root="/models/whisper")
align_models: dict = {}

diarizer = None
diarizer_error = None
try:
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        raise RuntimeError("HF_TOKEN is not set on the Runpod endpoint.")
    diarizer = DiarizationPipeline(token=hf_token, device=DEVICE)
    # The same WeSpeaker model the pipeline clusters with, so sample and speaker embeddings share one space.
    embedder = diarizer.model._embedding
    embedder.to(torch.device(DEVICE))
except Exception as exc:  # report on every job instead of crash-looping the worker
    diarizer_error = f"Diarization model failed to load: {exc}"


def download(url: str, dest: str) -> str:
    with requests.get(url, stream=True, timeout=(10, 300)) as r:
        r.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in r.iter_content(chunk_size=1 << 20):
                f.write(chunk)
    return dest


def embed(audio: np.ndarray) -> np.ndarray:
    waveform = torch.from_numpy(audio).float()[None, None, :]
    return np.asarray(embedder(waveform))[0]


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0 or not np.isfinite(na) or not np.isfinite(nb):
        return -1.0
    return float(np.dot(a, b) / (na * nb))


def letter(i: int) -> str:
    letters = string.ascii_uppercase
    return letters[i] if i < 26 else letters[i // 26 - 1] + letters[i % 26]


def align(result: dict, audio: np.ndarray, language: str) -> dict:
    try:
        if language not in align_models:
            align_models[language] = whisperx.load_align_model(language, DEVICE)
        model, metadata = align_models[language]
        return whisperx.align(result["segments"], model, metadata, audio, DEVICE, return_char_alignments=False)
    except Exception as exc:
        # No alignment model for this language: keep Whisper's segment timings.
        print(f"alignment skipped for {language}: {exc}")
        return {"segments": result["segments"]}


def split_by_speaker(segments: list, language: str) -> list:
    """Split each Whisper segment wherever the word-level speaker changes (crosstalk)."""
    joiner = "" if language in NO_SPACE_LANGUAGES else " "
    out = []
    for seg in segments:
        words = seg.get("words") or []
        if not any("speaker" in w for w in words):
            out.append({"speaker": seg.get("speaker"), "start": seg.get("start"), "end": seg.get("end"), "text": seg.get("text", "")})
            continue
        run = None
        for w in words:
            spk = w.get("speaker", run["speaker"] if run else seg.get("speaker"))
            if run is None or spk != run["speaker"]:
                if run:
                    out.append(run)
                run = {"speaker": spk, "start": w.get("start"), "end": w.get("end"), "words": []}
            run["words"].append(w.get("word", ""))
            if "start" in w and run["start"] is None:
                run["start"] = w["start"]
            if "end" in w:
                run["end"] = w["end"]
        if run:
            out.append(run)
    for s in out:
        if "words" in s:
            s["text"] = joiner.join(s.pop("words"))
        s["text"] = s["text"].strip()
    return [s for s in out if s["text"]]


def name_speakers(segments: list, speaker_embeddings: dict, voices: list) -> list:
    """Greedy one-to-one match of diarized speakers to saved voices, best score first."""
    pairs = []
    for label, vec in (speaker_embeddings or {}).items():
        for voice in voices:
            pairs.append((cosine(np.asarray(vec), voice["embedding"]), label, voice["name"]))
    pairs.sort(key=lambda p: p[0], reverse=True)

    names: dict = {}
    used: set = set()
    best: dict = {}
    for score, label, name in pairs:
        best.setdefault(label, (name, score))
        if score < MATCH_THRESHOLD or label in names or name in used:
            continue
        names[label] = name
        used.add(name)

    order = []
    for s in segments:
        if s["speaker"] not in order:
            order.append(s["speaker"])
    unnamed = 0
    for label in order:
        if label not in names:
            names[label] = letter(unnamed)
            unnamed += 1
    for s in segments:
        s["speaker"] = names[s["speaker"]]

    return [
        {
            "label": str(label),
            "speaker": names[label],
            "best_voice": best.get(label, (None, None))[0],
            "score": None if label not in best else round(best[label][1], 4),
        }
        for label in order
    ]


def handler(job):
    if diarizer is None:
        return {"error": diarizer_error}

    inp = job.get("input") or {}
    audio_url = inp.get("audio_url")
    if not isinstance(audio_url, str) or not audio_url:
        return {"error": "input.audio_url is required"}
    voices_in = inp.get("voices") or []
    if not isinstance(voices_in, list) or len(voices_in) > MAX_VOICES:
        return {"error": f"input.voices must be a list of at most {MAX_VOICES}"}

    with tempfile.TemporaryDirectory() as tmp:
        audio = whisperx.load_audio(download(audio_url, os.path.join(tmp, "audio")))
        duration = round(len(audio) / SAMPLE_RATE, 3)

        voices = []
        for i, v in enumerate(voices_in):
            if not isinstance(v, dict) or not v.get("name") or not v.get("url"):
                return {"error": f"input.voices[{i}] needs name and url"}
            sample = whisperx.load_audio(download(v["url"], os.path.join(tmp, f"voice{i}")))
            voices.append({"name": str(v["name"]), "embedding": embed(sample)})

        result = asr_model.transcribe(audio, batch_size=BATCH_SIZE, language=inp.get("language"))
        language = result["language"]
        aligned = align(result, audio, language)

        diarize_df, speaker_embeddings = diarizer(
            audio,
            min_speakers=inp.get("min_speakers"),
            max_speakers=inp.get("max_speakers"),
            return_embeddings=True,
        )
        aligned = whisperx.assign_word_speakers(diarize_df, aligned, fill_nearest=True)

    segments = split_by_speaker(aligned["segments"], language)
    for s in segments:
        if s["speaker"] is None:
            s["speaker"] = "UNKNOWN"
        s["start"] = round(float(s["start"] or 0.0), 3)
        s["end"] = round(float(s["end"] if s["end"] is not None else s["start"]), 3)
    speakers = name_speakers(segments, speaker_embeddings, voices)

    joiner = "" if language in NO_SPACE_LANGUAGES else " "
    return {
        "text": joiner.join(s["text"] for s in segments),
        "duration": duration,
        "language": language,
        "segments": segments,
        "speakers": speakers,
    }


runpod.serverless.start({"handler": handler})
