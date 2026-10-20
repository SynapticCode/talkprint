# Talkprint

Private recorder and transcriber with speaker labels. Built by Azael ("Ozzie") Montejo for his own use first; maybe sold later. Lives at **https://talkprint.azaelmontejo.com**.

Why it exists: Azael uses the Genio app to record team conversations in rooms with heavy crosstalk. Genio is accurate and tells speakers apart; his Android voice recorder is not. Talkprint matches Genio's accuracy with OpenAI's diarizing model plus saved voice samples, so transcripts name the people he talks with and ignore the rest of the room.

## How Azael works (read this first)
- Direct answers, no softening. Exact numbers, not ranges.
- Setup instructions must be literal clicks ("Settings → API Keys → Create"), researched and verified first, with the complete final state in one block.
- Copy-pasteable things go in code blocks.
- He's on Windows (Lenovo Legion 7, NVIDIA GPU) and an Android phone.
- Don't create docs or reports he didn't ask for. Answer in the conversation.

## Stack
| Piece | Choice | Notes |
|---|---|---|
| App | Next.js 15.5 App Router, React 19, TypeScript, Tailwind 3.4 | App is at repo **root** (not a subfolder) so Vercel needs no Root Directory setting |
| Hosting | Vercel, team `azael-montejo-jr-s-projects` (team_jF8E9uacytoOEijzmUkRccFs), Hobby plan | Hobby = non-commercial only. Switch to Pro ($20/mo) before charging anyone |
| Auth + DB + files | Supabase project `talkprint`, ref `lcxcvowxzwymkeyillll`, us-east-1, org "Lava" | Free plan: 2 projects/org (lava-intake is the other), 500 MB DB, 1 GB storage, pauses after 7 idle days |
| Transcription | OpenAI `gpt-4o-transcribe-diarize`, `response_format=diarized_json`, `chunking_strategy=auto` | $0.006/min ($0.36/hour). 25 MB/file. Up to 4 known speakers, each clip 2–10 s, sent as data URLs |
| Domain | `talkprint.azaelmontejo.com` | DNS is at **Dynadot** (ns1/ns2.dyna-ns.net). Main site azaelmontejo.com is static HTML on **Hostinger** (repo SynapticCode/azaelmontejo-website). Talkprint only needs a CNAME `talkprint → cname.vercel-dns.com`; never touch the apex records |

## Access model (invite-only, Google sign-in only)
- Sign-in is Google OAuth through Supabase Auth. No passwords, no magic links.
- `public.allowed_users (email pk, role admin|user)` is the invite list. Anyone can complete Google sign-in, but if their email isn't in the list they only see "Access pending".
- Enforced in three places: `src/app/app/layout.tsx` (renders Access pending), `requireAllowedUser()` in `src/lib/supabase/server.ts` (every API route), and RLS on every table and storage bucket (`public.is_allowed()`).
- `is_allowed()` / `is_admin()` are SECURITY DEFINER with `search_path = public, auth`. Keep it that way or the auth.users join breaks for normal sessions.
- **No service-role key anywhere.** All data access runs as the signed-in user under RLS. The keepalive cron calls the `keepalive()` RPC with the publishable key.
- Add someone (Supabase → SQL Editor):
  ```sql
  insert into public.allowed_users (email, role) values ('person@gmail.com', 'user');
  ```
  Remove: `delete from public.allowed_users where email = 'person@gmail.com';`

## How a transcription flows
1. Browser records (MediaRecorder, Opus at 32 kbps, about 1 h 45 min per 25 MB) or picks a file.
2. Browser uploads straight to Supabase Storage bucket `audio` at `<user id>/<transcript id>.<ext>`. This skips Vercel's 4.5 MB request-body limit.
3. Browser inserts the `transcripts` row (status `processing`, `audio_path` set) and fires `POST /api/transcribe {id}` without waiting.
4. `/api/transcribe` (maxDuration 300 s) downloads the audio and up to 4 voice samples from `voice-samples`, calls OpenAI with fetch + FormData (`known_speaker_names[]`, `known_speaker_references[]`), saves `segments` and `text`, sets status `done`, clears `audio_path`, and **deletes the audio**. Storage is 1 GB; transcripts are tiny, audio isn't.
5. On failure: status `error`, audio is kept so "Try again" works.
6. `/app/t/[id]` polls every 4 s while processing.

## Files that matter
- `supabase/migrations/0001_init.sql`: the whole schema. Tables, RLS, buckets, helper functions, voice-sample limit trigger, `monthly_usage_seconds()`, `keepalive()`.
- `src/middleware.ts`: refreshes the session cookie on every request and redirects signed-out users to `/login`. `/api/keepalive` returns early before auth (lava-intake bug: the cron got 302'd to /login and Supabase paused).
- `src/app/auth/callback/route.ts`: server-side `exchangeCodeForSession`. Must stay server-side so the HttpOnly cookies get set.
- `src/lib/transcribe.ts`: the OpenAI call and response parsing.
- `src/lib/startTranscription.ts`: client upload + kickoff.
- `vercel.json`: daily cron `0 12 * * *` → `/api/keepalive`. Hobby allows once a day at most.

## Environment variables
| Name | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | No (`sb_publishable_...`) |
| `OPENAI_API_KEY` | Vercel + `.env.local` | **Yes**. Azael pastes it himself; never ask him to paste it in chat |
| `OPENAI_TRANSCRIBE_MODEL` | optional | No |
| `CRON_SECRET` | Vercel only | Yes. If set, `/api/keepalive` requires `Authorization: Bearer <CRON_SECRET>` (Vercel sends it automatically) |

Set every variable for **Production and Preview** in Vercel. lava-intake set them Production-only, so its preview deployments booted broken.

## Commands
```bash
npm install
npm run dev          # http://localhost:3000 (add http://localhost:3000/auth/callback to Supabase redirect URLs)
npm run typecheck    # safe on Windows
npm run build        # run on Vercel or Linux; lava-intake hit Turbopack EINVAL building on Windows
```

## Deploy
Push to `main` on GitHub → Vercel builds and deploys automatically. After a push, confirm the deployment is READY and its commit matches, then test on talkprint.azaelmontejo.com.

## Supabase Auth settings (dashboard only, not in SQL)
- Authentication → URL Configuration → Site URL: `https://talkprint.azaelmontejo.com`
- Redirect URLs: `https://talkprint.azaelmontejo.com/auth/callback`, `http://localhost:3000/auth/callback`
- Authentication → Sign In / Providers → Google: enabled with the Client ID and Client Secret from Google Cloud. Google's Authorized redirect URI is `https://lcxcvowxzwymkeyillll.supabase.co/auth/v1/callback`.

## Known limits and what's next
- 25 MB per file (OpenAI). Recordings at 32 kbps fit about 1 h 45 min. Larger uploads (long videos) need browser-side audio extraction or chunking. If chunking, send the voice samples with every chunk so speaker names stay consistent across chunks.
- Very long audio may exceed the 300 s function limit. If that happens, move the OpenAI call to a background job (Supabase Edge Function or a queue).
- No in-app admin screen yet; invites are SQL.
- Later ideas discussed with Azael: Windows desktop app with local WhisperX on the Legion's GPU (free, offline); native Android app for screen-off recording; paid tier at $7.99/mo with a visible hours meter and $0.99/hour top-ups, which needs Stripe, Vercel Pro and Supabase Pro first; a cheaper engine (self-hosted Whisper on a serverless GPU, roughly $0.08/hour).
- Name: "Talkprint" checked clear on the web, app stores and the USPTO register (Oct 2026). talkprint.com is parked for sale; talkprint.app / .io unverified.

## Related
- `SynapticCode/lava-intake`: Azael's other Next.js + Supabase app. Source of the allow-list, middleware and keepalive patterns used here.
