import { createClient } from "@/lib/supabase/server";
import type { VoiceProfile } from "@/lib/types";
import { VoiceManager } from "./VoiceManager";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const supabase = await createClient();
  const { data: voices } = await supabase
    .from("voice_profiles")
    .select("*")
    .order("created_at", { ascending: true })
    .returns<VoiceProfile[]>();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Voices</h1>
        <p className="mt-2 text-sm text-muted">
          Save a short sample of each person you talk with often, up to 4. Transcripts then show their names
          instead of Speaker A and B, and voices that don&apos;t match stay labeled as unknown speakers.
        </p>
      </div>
      <VoiceManager initialVoices={voices ?? []} />
    </div>
  );
}
