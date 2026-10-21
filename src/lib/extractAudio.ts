"use client";

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  Output,
  Quality,
  UnsupportedInputFormatError,
  WebMOutputFormat,
  canEncodeAudio,
} from "mediabunny";

// Any audio or video file -> mono 32 kbps Opus in WebM, the same format the
// in-app recorder makes (~14 MB per hour). Runs in the browser with WebCodecs,
// so a 2 GB screen recording never leaves the device; only its sound is uploaded.
const BITRATE = 32_000;

export async function extractAudio(file: File, onProgress?: (fraction: number) => void): Promise<Blob> {
  if (!(await canEncodeAudio("opus", { numberOfChannels: 1, sampleRate: 48000, bitrate: BITRATE }))) {
    throw new Error("This browser can't convert audio. Use Chrome.");
  }

  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const target = new BufferTarget();
    const output = new Output({ format: new WebMOutputFormat(), target });
    const conversion = await Conversion.init({
      input,
      output,
      tracks: "primary",
      video: { discard: true },
      audio: { codec: "opus", numberOfChannels: 1, sampleRate: 48000, quality: new Quality(BITRATE), forceTranscode: true },
      showWarnings: false,
    });

    if (!conversion.utilizedTracks.some((t) => t.isAudioTrack())) {
      const audio = conversion.discardedTracks.find((d) => d.track.isAudioTrack());
      throw new Error(
        audio ? `This file's sound can't be read in the browser (${audio.reason}).` : "This file has no sound track.",
      );
    }

    if (onProgress) conversion.onProgress = (progress) => onProgress(progress);
    await conversion.execute();
    if (!target.buffer) throw new Error("Audio conversion produced no output.");
    return new Blob([target.buffer], { type: "audio/webm" });
  } catch (err) {
    if (err instanceof UnsupportedInputFormatError) throw new Error("That file type can't be read. Try an MP4, MKV, MOV, WebM, MP3, M4A or WAV.");
    throw err;
  } finally {
    input.dispose();
  }
}
