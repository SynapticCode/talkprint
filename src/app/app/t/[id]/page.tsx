import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Transcript } from "@/lib/types";
import { TranscriptView } from "./TranscriptView";

export const dynamic = "force-dynamic";

export default async function TranscriptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: transcript } = await supabase.from("transcripts").select("*").eq("id", id).maybeSingle<Transcript>();
  if (!transcript) notFound();
  return <TranscriptView transcript={transcript} />;
}
