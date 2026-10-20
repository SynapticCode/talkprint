import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseEnv } from "@/lib/env";

/** Supabase client bound to the signed-in user's cookies. RLS applies to every query. */
export async function createClient() {
  assertSupabaseEnv();
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

/**
 * Signed-in AND on the allow-list. Every API route calls this first.
 * No service-role key anywhere: data access runs as the user, under RLS.
 */
export async function requireAllowedUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, error: "Not signed in" };

  const { data: allowed, error } = await supabase.rpc("is_allowed");
  if (error || allowed !== true) return { ok: false as const, status: 403, error: "Not invited" };

  return { ok: true as const, user, supabase };
}
