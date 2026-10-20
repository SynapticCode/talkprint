import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Vercel cron (vercel.json) calls this once a day so the free Supabase project
// never hits the 7-day inactivity pause. Copied from lava-intake, minus the
// service-role key: it calls a harmless RPC with the publishable key instead.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("keepalive");
  if (error) {
    console.error("[keepalive] ping failed", error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  console.log("[keepalive] database ping ok");
  return NextResponse.json({ ok: true, pinged_at: new Date().toISOString() });
}
