# Talkprint transcription worker for Runpod Serverless.
# Built by Runpod's GitHub integration: Dockerfile path worker/Dockerfile, build context = repo root.
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/hf \
    TORCH_HOME=/models/torch \
    NLTK_DATA=/models/nltk

# ffmpeg decodes webm/m4a/mp4/etc. for whisperx.load_audio and provides the libs torchcodec links against.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY worker/requirements.txt .
RUN pip install -r requirements.txt

# CTranslate2 (faster-whisper) loads cuDNN 9 and cuBLAS 12 by soname; reuse the copies torch's wheels ship.
ENV LD_LIBRARY_PATH=/usr/local/lib/python3.11/site-packages/nvidia/cudnn/lib:/usr/local/lib/python3.11/site-packages/nvidia/cublas/lib

COPY worker/download_models.py .
RUN python download_models.py

COPY worker/handler.py .
CMD ["python", "-u", "handler.py"]
