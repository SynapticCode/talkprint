# Talkprint

Private recorder and transcriber with speaker labels. Built by Azael ("Ozzie") Montejo for his own use first; sold later only if it holds up. Lives at **https://talkprint.azaelmontejo.com**.

Why it exists: Azael uses the Genio app to record team conversations in rooms with heavy crosstalk. Genio is accurate and tells speakers apart; his Android voice recorder is not. Talkprint matches Genio with self-hosted WhisperX + pyannote plus saved voice samples, so transcripts name the people he talks with and ignore the rest of the room.

## Rules for working with Azael (read this first)
- **Do not build anything he has not asked for in the current session.** Say what you intend to do and wait for "go". An earlier session built the whole app on an engine he had not approved; don't repeat that.
- **Ask before any step that costs money** (Runpod credit, paid plans, domains).
- Direct answers, no softening. Exact numbers, not ranges. If a number is an estimate, say so and say how to measure it.
- Setup instructions must be literal clicks ("Settings → API Keys → Create"), researched and verified first, with the complete final state in one block.
- Copy-pasteable things go in code blocks.
- He's on Windows (Lenovo Legion 7, NVIDIA GPU) and an Android phone.
- Don't create docs or reports he didn't ask for. Answer in the conversation.
- Spell the GPU host **Runpod** (one capital), per their docs.

## Status: pick up here (as of 2026-10-20, evening)
The app shell is complete and builds. **It is not live yet.** The transcription engine must be replaced before anything is deployed.

Done:
- [x] App code (this repo), `next build` passes
- [x] Supabase project `talkprint` created (ref `lcxcvowxzwymkeyillll`, us-east-1, org "Lava"), status ACTIVE_HEALTHY
- [x] GitHub repo `SynapticCode/talkprint` (private)
- [x] Hugging Face account created (username `m00n11t3`)
- [x] Runpod Claude Code plugin installed in the cloud session (`runpod@runpod` v1.8.0). It still has to be installed in the Claude Code you open this repo in; see step 0.

**Wrong and must change:** `src/lib/transcribe.ts` and `src/app/api/transcribe/route.ts` call OpenAI `gpt-4o-transcribe-diarize`. That engine costs $0.36 per audio hour, so the planned $7.99/month plan with a 25-hour cap loses money ($9.00 in fees). The OpenAI model and its voice-sample feature are real (verified against OpenAI's docs), but it is the wrong engine for the price. Replace it; do not deploy it.

Not done, in this order:
0. [ ] **Runpod plugin in this Claude Code.** Run these two commands, then Azael runs `/reload-plugins` and signs in with `/mcp` → **runpod** → **Sign in with Runpod** (OAuth, no API key stored):
   ```
   claude plugin marketplace add runpod/runpod-plugins-official
   claude plugin install runpod@runpod
   ```
   Verify with `claude plugin list | grep -A2 'runpod@runpod'` → `Status: ✔ enabled`. Source: https://docs.runpod.io/agent-setup.md. After sign-in, list his Pods with the Runpod MCP tools; an empty list is a pass.
1. [ ] **Azael, before the worker is built:** Runpod account at runpod.io with credit added (ask him how much; the Runpod skills will say the minimum), and on Hugging Face accept the model terms at https://huggingface.co/pyannote/speaker-diarization-community-1 and create a **read** access token (Settings → Access Tokens). Secrets never go in chat; they go into Vercel/Runpod env vars by him.
2. [ ] **Build the Runpod Serverless worker** in `/worker` (Dockerfile + handler): WhisperX (faster-whisper large-v3-turbo) + pyannote `speaker-diarization-community-1`, plus speaker matching: compute a pyannote embedding for each saved voice sample and for each diarized speaker, cosine-match, label matched speakers by name and the rest `A`, `B`, `C`. Input: a signed URL to the audio in Supabase Storage plus signed URLs for up to 4 voice samples. Output: `{ text, duration, segments: [{ speaker, start, end, text }] }`, the same shape `src/lib/types.ts` already expects. Use the Runpod `serverless-deploy` skill. Cheapest GPU class that fits (A40/A6000 48 GB is $1.22/hr flex, $0.00034/s; 16 GB class is $0.58/hr; try the cheaper one first).
3. [ ] **Measure the real cost.** Run one ~25-minute test file through the endpoint and record seconds of GPU time × the per-second rate. Write the measured cost per audio hour here, replacing the estimate below. If it is above $0.17/hour, stop and tell Azael: AssemblyAI (Universal-2 $0.15 + $0.02 diarization = $0.17/hour, no voice samples) becomes the fallback.
4. [ ] **Swap the app's engine.** Replace `src/lib/transcribe.ts` with a Runpod call (`POST https://api.runpod.ai/v2/<ENDPOINT_ID>/run`, then poll `/status/<job id>`, or `/runsync` if the job fits under Vercel's 300 s limit). Delete `OPENAI_API_KEY` / `OPENAI_TRANSCRIBE_MODEL` everywhere. Keep `/api/transcribe`'s contract with the UI unchanged.
5. [ ] **Apply the schema.** Run `supabase/migrations/0001_init.sql` against project `lcxcvowxzwymkeyillll` (Supabase MCP `apply_migration`, or paste into Supabase → SQL Editor → Run). The first attempt was cancelled at the approval prompt; nothing was applied. Verify afterwards with Supabase security advisors.
6. [ ] **Seed the first admin:** `insert into public.allowed_users (email, role) values ('montejoazaeljr@gmail.com', 'admin');`
7. [ ] **Create the Vercel project** from GitHub repo `SynapticCode/talkprint` in team `team_jF8E9uacytoOEijzmUkRccFs`. Framework Next.js, root directory = repo root (leave blank). Env vars for Production AND Preview: `NEXT_PUBLIC_SUPABASE_URL=https://lcxcvowxzwymkeyillll.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase MCP `get_publishable_keys`, the `sb_publishable_...` one), `CRON_SECRET` (random 32+ chars, Sensitive). Azael adds `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID` and `HF_TOKEN` himself (Sensitive).
8. [ ] **Add the domain** `talkprint.azaelmontejo.com` to that Vercel project.
9. [ ] **Azael does these himself** (give literal, verified click-by-click steps):
   - Google Cloud Console: OAuth client (Web application). Authorized JavaScript origin `https://talkprint.azaelmontejo.com`; Authorized redirect URI `https://lcxcvowxzwymkeyillll.supabase.co/auth/v1/callback`. Paste Client ID and Client Secret into Supabase → Authentication → Sign In / Providers → Google, and enable it. lava-intake never used Google, so nothing can be copied from it.
   - Supabase → Authentication → URL Configuration: Site URL and Redirect URLs as listed under "Supabase Auth settings" below.
   - Dynadot DNS for azaelmontejo.com: add `CNAME`, host `talkprint`, value `cname.vercel-dns.com`. Add only this record; don't touch anything else.
10. [ ] **Test end to end** on https://talkprint.azaelmontejo.com: Google sign-in, Access pending for a non-invited account, record 30 s on the Android phone, upload a short video from the laptop, add a voice sample, transcribe, check speaker names.
11. [ ] Later, in this order: Azael uses it himself for a while → Android app (wrapper around the same site, $25 one-time Google Play fee) → Stripe + Vercel Pro ($20/mo) + Supabase Pro ($25/mo) only when selling.

Azael's preference: keep everything on GitHub and work through Claude Code (web or laptop). A local clone on his laptop is optional.

## Why self-hosted (the economics the product is built on)
Target plan: $7.99/month, 25 audio hours/month cap, $0.99 per extra hour, free tier 2 hours. Stripe takes 2.9% + $0.30 = $0.53 on $7.99.

| Engine (October 2026 list prices) | Per audio hour | At the 25 h cap | Voice samples? |
|---|---|---|---|
| OpenAI gpt-4o-transcribe-diarize (what the code currently calls) | $0.36 | $9.00 → loses money | Yes |
| Deepgram Nova-3 + diarization | $0.41 | $10.25 → loses money | No |
| AssemblyAI Universal-2 + diarization | $0.17 | $4.25 → $3.21 margin | No (A/B/C labels) |
| **Self-hosted WhisperX + pyannote on Runpod Serverless** | **~$0.08–0.10 (estimate, unmeasured)** | ~$2.00–2.50 → ~$5.00 margin | Yes |

The estimate is derived: A40 flex worker at $1.22/hr ($0.00034/s) and a published benchmark of ~2 minutes GPU time per 25-minute file. Step 3 above replaces it with a measured number. Self-hosting is the only option that is both the cheapest and keeps the "know my voice" feature.

## Stack
| Piece | Choice | Notes |
|---|---|---|
| App | Next.js 15.5 App Router, React 19, TypeScript, Tailwind 3.4 | App is at repo **root** (not a subfolder) so Vercel needs no Root Directory setting |
| Hosting | Vercel, team `azael-montejo-jr-s-projects` (team_jF8E9uacytoOEijzmUkRccFs), Hobby plan | Hobby = non-commercial only. Switch to Pro ($20/mo) before charging anyone |
| Auth + DB + files | Supabase project `talkprint`, ref `lcxcvowxzwymkeyillll`, us-east-1, org "Lava" | Free plan: 2 projects/org (lava-intake is the other), 500 MB DB, 1 GB storage, pauses after 7 idle days |
| Transcription | **Runpod Serverless** worker in `/worker`: WhisperX (faster-whisper large-v3-turbo) + pyannote speaker-diarization-community-1 + embedding match against saved voice samples | Per-second GPU billing, scales to zero. Up to 4 saved voices. Needs `RUNPOD_API_KEY`, `RUNPOD_ENDPOINT_ID`, `HF_TOKEN` |
| Domain | `talkprint.azaelmontejo.com` | DNS is at **Dynadot** (ns1/ns2.dyna-ns.net). Main site azaelmontejo.com is static HTML on **Hostinger** (repo SynapticCode/azaelmontejo-website). Talkprint only needs a CNAME `talkprint → cname.vercel-dns.com`; never touch the apex records |

## Access model (invite-only, Google sign-in only)
- Sign-in is Google OAuth through Supabase Auth. No passwords, no magic links.
- `public.allowed_users (email pk, role admin|user)` is the invite list. Anyone can complete Google sign-in, but if their email isn't in the list they only see "Access pending".
- Enforced in three places: `src/app/app/layout.tsx` (renders Access pending), `requireAllowedUser()` in `src/lib/supabase/server.ts` (every API route), and RLS on every table and storage bucket (`public.is_allowed()`).
- `is_allowed()` / `is_admin()` are SECURITY DEFINER with `search_path = public, auth`. Keep it that way or the auth.users join breaks for normal sessions.
- **No service-role key anywhere.** All data access runs as the signed-in user under RLS. The keepalive cron calls the `keepalive()` RPC with the publishable key.
- Admin: `montejoazaeljr@gmail.com`. Add someone (Supabase → SQL Editor):
  ```sql
  insert into public.allowed_users (email, role) values ('person@gmail.com', 'user');
  ```
  Remove: `delete from public.allowed_users where email = 'person@gmail.com';`

## How a transcription flows (target design)
1. Browser records (MediaRecorder, Opus at 32 kbps) or picks a file.
2. Browser uploads straight to Supabase Storage bucket `audio` at `<user id>/<transcript id>.<ext>`. This skips Vercel's 4.5 MB request-body limit.
3. Browser inserts the `transcripts` row (status `processing`, `audio_path` set) and fires `POST /api/transcribe {id}` without waiting.
4. `/api/transcribe` creates short-lived signed URLs for the audio and up to 4 voice samples, submits a Runpod job, waits for the result (poll `/status`), saves `segments` and `text`, sets status `done`, clears `audio_path`, and **deletes the audio**. Storage is 1 GB; transcripts are tiny, audio isn't.
5. On failure: status `error`, audio is kept so "Try again" works.
6. `/app/t/[id]` polls every 4 s while processing.
7. If a job can outlive Vercel's 300 s function limit, move the wait to a Runpod webhook that calls back into the app, or to a Supabase Edge Function.

## Files that matter
- `supabase/migrations/0001_init.sql`: the whole schema. Tables, RLS, buckets, helper functions, voice-sample limit trigger, `monthly_usage_seconds()`, `keepalive()`.
- `src/middleware.ts`: refreshes the session cookie on every request and redirects signed-out users to `/login`. `/api/keepalive` returns early before auth (lava-intake bug: the cron got 302'd to /login and Supabase paused).
- `src/app/auth/callback/route.ts`: server-side `exchangeCodeForSession`. Must stay server-side so the HttpOnly cookies get set.
- `src/lib/transcribe.ts`: **currently OpenAI; to be replaced with the Runpod call** (step 4).
- `src/lib/startTranscription.ts`: client upload + kickoff.
- `src/lib/types.ts`: `Segment { speaker, start, end, text }` is the contract the worker must return.
- `worker/`: Runpod Serverless worker (to be created, step 2).
- `vercel.json`: daily cron `0 12 * * *` → `/api/keepalive`. Hobby allows once a day at most.

## Environment variables
| Name | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | No (`sb_publishable_...`) |
| `RUNPOD_API_KEY` | Vercel + `.env.local` | **Yes**. Azael pastes it himself; never ask him to paste it in chat |
| `RUNPOD_ENDPOINT_ID` | Vercel + `.env.local` | No |
| `HF_TOKEN` | Runpod endpoint env (the worker pulls the pyannote model) | **Yes**. Azael sets it in the Runpod endpoint settings |
| `CRON_SECRET` | Vercel only | Yes. If set, `/api/keepalive` requires `Authorization: Bearer <CRON_SECRET>` (Vercel sends it automatically) |

`OPENAI_API_KEY` and `OPENAI_TRANSCRIBE_MODEL` are gone once step 4 is done. Set every variable for **Production and Preview** in Vercel. lava-intake set them Production-only, so its preview deployments booted broken.

## Commands
```bash
npm install
npm run dev          # http://localhost:3000 (add http://localhost:3000/auth/callback to Supabase redirect URLs)
npm run typecheck    # safe on Windows
npm run build        # run on Vercel or Linux; lava-intake hit Turbopack EINVAL building on Windows
```

## Deploy
Push to `main` on GitHub → Vercel builds and deploys automatically. After a push, confirm the deployment is READY and its commit matches, then test on talkprint.azaelmontejo.com. The Runpod worker deploys separately (Runpod `serverless-deploy` skill); its endpoint id goes into `RUNPOD_ENDPOINT_ID`.

## Supabase Auth settings (dashboard only, not in SQL)
- Authentication → URL Configuration → Site URL: `https://talkprint.azaelmontejo.com`
- Redirect URLs: `https://talkprint.azaelmontejo.com/auth/callback`, `http://localhost:3000/auth/callback`
- Authentication → Sign In / Providers → Google: enabled with the Client ID and Client Secret from Google Cloud. Google's Authorized redirect URI is `https://lcxcvowxzwymkeyillll.supabase.co/auth/v1/callback`.

## Known limits and what's next
- Recordings at 32 kbps are about 14 MB/hour. The 25 MB bucket limit in the schema was OpenAI's per-file limit; raise it once the Runpod worker is in (the worker downloads from a signed URL, so there is no request-size ceiling).
- No in-app admin screen yet; invites are SQL.
- Later: Windows desktop app with local WhisperX on the Legion's GPU (free, offline); native Android app for screen-off recording; paid tier at $7.99/mo with a visible hours meter and $0.99/hour top-ups (needs Stripe, Vercel Pro, Supabase Pro first).
- Name: "Talkprint" checked clear on the web, app stores and the USPTO register (Oct 2026). talkprint.com is parked for sale; talkprint.app / .io unverified.

## Related
- `SynapticCode/lava-intake`: Azael's other Next.js + Supabase app. Source of the allow-list, middleware and keepalive patterns used here.
- Runpod agent setup: https://docs.runpod.io/agent-setup.md. Runpod docs index: https://docs.runpod.io/llms.txt.
