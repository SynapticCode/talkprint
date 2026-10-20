export type Segment = {
  speaker: string;
  start: number;
  end: number;
  text: string;
};

export type TranscriptStatus = "processing" | "done" | "error";

export type Transcript = {
  id: string;
  user_id: string;
  title: string;
  source: "recording" | "upload";
  status: TranscriptStatus;
  audio_path: string | null;
  duration_seconds: number | null;
  text: string | null;
  segments: Segment[] | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
};

export type VoiceProfile = {
  id: string;
  user_id: string;
  name: string;
  storage_path: string;
  duration_seconds: number | null;
  created_at: string;
};
