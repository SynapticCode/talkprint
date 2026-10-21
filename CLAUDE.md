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

## Status: pick up here (as of 2026-10-21)
Worker is live on Runpod and passed a test job. Schema is applied and the admin is seeded on the new Supabase project. App code changes are uncommitted (not on GitHub yet). **The site is not live yet**: next is the Vercel project (step 7). The Vercel connector in Claude Code returns 403 on project creation, so Azael imports it in the dashboard.

Done:
- [x] App code (this repo), `next build` passes
- [x] Supabase project `talkprint` created 2026-10-21 (ref `jgekspfpoevweexticap`, us-east-1 North Virginia, org "talkprint" `obeuleqhhxtomrincgcs` on Azael's own Supabase account, signed in with GitHub SynapticCode). Created with Data API on, "Automatically expose new tables" off, "Enable automatic RLS" on
- [x] GitHub repo `SynapticCode/talkprint` (private)
- [x] Hugging Face account created (username `m00n11t3`)
- [x] Runpod Claude Code plugin (`runpod@runpod` v1.8.0) installed and signed in on the laptop

Not done, in this order:
0. [x] **Runpod plugin in this Claude Code.** Installed and signed in on the laptop (2026-10-20); `list-pods` and `list-endpoints` returned empty lists.
1. [x] **Azael:** Runpod account with $10 credit; pyannote `speaker-diarization-community-1` terms accepted; Hugging Face read token created (he sets it as `HF_TOKEN` on the Runpod endpoint).
2. [x] **Runpod Serverless worker** in `worker/`: WhisperX 3.8.6 (large-v3-turbo) + pyannote community-1 + voice matching (`MATCH_THRESHOLD` 0.5, unmeasured). Endpoint `talkprint`, id `5z6n8djwbn5g5s`, built by Runpod's GitHub integration (Dockerfile `worker/Dockerfile`, build context `.`; push to `main` does NOT rebuild, create a GitHub release). Settings: pools AMPERE_16 ($0.58/hr) + AMPERE_24 ($0.69/hr), RTX PRO 6000 MIG excluded (Blackwell, untested with CTranslate2), CUDA ≥ 12.8, max 2 workers, 0 active, idle 5 s, FlashBoot on, timeout 30 min, `HF_TOKEN={{ RUNPOD_SECRET_hf_token }}` (Runpod secret `hf_token`). Test 2026-10-21: pyannote 30 s two-speaker sample → correct text, speakers A/B (one handoff word mislabeled); 4.8 s execution, 28 s billed (~$0.0045 at $0.00016/s), first cold start 2.5 min (image pull, unbilled).
3. [ ] **Measure the real cost.** Planned file: Azael's 19:16 OBS recording `sample recording/2026-07-16 19-35-53.mkv` (git-ignored; delete it after the test, with his OK), run through the app once the schema is in. Run one ~25-minute test file through the endpoint and record seconds of GPU time × the per-second rate. Write the measured cost per audio hour here, replacing the estimate below. If it is above $0.17/hour, stop and tell Azael: AssemblyAI (Universal-2 $0.15 + $0.02 diarization = $0.17/hour, no voice samples) becomes the fallback.
4. [x] **App engine swapped** (code only, not deployed). `src/lib/transcription.ts` submits `/run` and stores `job_id`; the transcript page polls `POST /api/transcribe {id, check:true}` every 4 s and the home page checks pending rows on load; a result Runpod no longer has (kept 30 min after finishing) is resubmitted automatically. Uploads: any audio/video is converted in the browser to mono 32 kbps Opus WebM (`src/lib/extractAudio.ts`, Mediabunny 1.62.0), so only the sound is uploaded. Audio bucket raised to 50 MB (Free plan max, ~3.5 h). OpenAI code and env vars removed. Voice samples now 5–20 s.
5. [x] **Schema applied** 2026-10-21 to `jgekspfpoevweexticap`: migrations `init` (`0001_init.sql`) and `advisor_fixes` (`0002_advisor_fixes.sql`: authenticated keeps only select/insert/update/delete, `rls_auto_enable()` not callable over the API, RLS calls wrapped in `(select ...)`, index on `voice_profiles.user_id`). Security advisors after: only the intended warnings remain (`keepalive()` callable by anon; `is_allowed()`/`is_admin()`/`keepalive()` callable by signed-in users, each returns only a boolean or 1). Verified that automatic RLS still turns on for new tables.
6. [x] **First admin seeded:** `montejoazaeljr@gmail.com`, role `admin`.
7. [ ] **Create the Vercel project** from GitHub repo `SynapticCode/talkprint` in team `team_jF8E9uacytoOEijzmUkRccFs` (lava-intake is the only other project there; don't touch it). Framework Next.js, root directory = repo root (leave blank). Push the uncommitted app code first, or the import builds the old OpenAI version. Env vars for Production AND Preview: `NEXT_PUBLIC_SUPABASE_URL=https://jgekspfpoevweexticap.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_BhGpVEbOt06mm6v6U9uTCA_W9DbiQtX`, `RUNPOD_ENDPOINT_ID=5z6n8djwbn5g5s`, `CRON_SECRET` (random 64 hex chars, Sensitive), `RUNPOD_API_KEY` (Azael pastes it, Sensitive). `HF_TOKEN` is not needed in Vercel; it lives on the Runpod endpoint.
8. [ ] **Add the domain** `talkprint.azaelmontejo.com` to that Vercel project.
9. [ ] **Azael does these himself** (give literal, verified click-by-click steps):
   - Google Cloud Console: OAuth client (Web application). Authorized JavaScript origin `https://talkprint.azaelmontejo.com`; Authorized redirect URI `https://jgekspfpoevweexticap.supabase.co/auth/v1/callback`. Paste Client ID and Client Secret into Supabase → Authentication → Sign In / Providers → Google, and enable it.
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
| Auth + DB + files | Supabase project `talkprint`, ref `jgekspfpoevweexticap`, us-east-1, org "talkprint" | Free plan: 500 MB DB, 1 GB storage, pauses after 7 idle days |
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
1. Browser records (MediaRecorder, Opus at 32 kbps) or picks any audio/video file, which is converted in the browser to the same 32 kbps Opus (`src/lib/extractAudio.ts`).
2. Browser uploads straight to Supabase Storage bucket `audio` at `<user id>/<transcript id>.<ext>`. This skips Vercel's 4.5 MB request-body limit.
3. Browser inserts the `transcripts` row (status `processing`, `audio_path` set) and fires `POST /api/transcribe {id}` without waiting.
4. `/api/transcribe` creates 6-hour signed URLs for the audio and up to 4 voice samples, submits a Runpod `/run` job and saves its `job_id`. No request waits for the job.
5. `/app/t/[id]` calls `/api/transcribe {id, check:true}` every 4 s (the home page does the same for every processing row on load). When Runpod says COMPLETED it saves `segments` and `text`, sets status `done`, clears `audio_path` and `job_id`, and **deletes the audio**. Storage is 1 GB; transcripts are tiny, audio isn't.
6. On failure: status `error`, audio is kept so "Try again" works. If Runpod has dropped the result (30 min after finishing), the job is resubmitted.

## Files that matter
- `supabase/migrations/0001_init.sql`: the whole schema. Tables, RLS, buckets, helper functions, voice-sample limit trigger, `monthly_usage_seconds()`, `keepalive()`.
- `src/middleware.ts`: refreshes the session cookie on every request and redirects signed-out users to `/login`. `/api/keepalive` returns early before auth (if the cron gets 302'd to /login, Supabase pauses).
- `src/app/auth/callback/route.ts`: server-side `exchangeCodeForSession`. Must stay server-side so the HttpOnly cookies get set.
- `src/lib/transcription.ts`: Runpod submit/check, saves results, deletes audio.
- `src/lib/extractAudio.ts`: in-browser audio extraction for uploads (Mediabunny).
- `src/lib/startTranscription.ts`: client upload + kickoff.
- `src/lib/types.ts`: `Segment { speaker, start, end, text }` is the contract the worker must return.
- `worker/`: Runpod Serverless worker (Dockerfile, `handler.py`, `download_models.py`).
- `vercel.json`: daily cron `0 12 * * *` → `/api/keepalive`. Hobby allows once a day at most.

## Environment variables
| Name | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + `.env.local` | No |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Vercel + `.env.local` | No (`sb_publishable_...`) |
| `RUNPOD_API_KEY` | Vercel + `.env.local` | **Yes**. Azael pastes it himself; never ask him to paste it in chat |
| `RUNPOD_ENDPOINT_ID` | Vercel + `.env.local` | No (`5z6n8djwbn5g5s`) |
| `HF_TOKEN` | Runpod endpoint env (the worker pulls the pyannote model) | **Yes**. Azael sets it in the Runpod endpoint settings |
| `CRON_SECRET` | Vercel only | Yes. If set, `/api/keepalive` requires `Authorization: Bearer <CRON_SECRET>` (Vercel sends it automatically) |

Set every variable for **Production and Preview** in Vercel, or preview deployments boot broken.

## Commands
```bash
npm install
npm run dev          # http://localhost:3000 (add http://localhost:3000/auth/callback to Supabase redirect URLs)
npm run typecheck    # safe on Windows
npm run build        # run on Vercel or Linux; Turbopack can hit EINVAL building on Windows
```

## Deploy
Push to `main` on GitHub → Vercel builds and deploys automatically. After a push, confirm the deployment is READY and its commit matches, then test on talkprint.azaelmontejo.com. The Runpod worker deploys separately (Runpod `serverless-deploy` skill); its endpoint id goes into `RUNPOD_ENDPOINT_ID`.

## Supabase Auth settings (dashboard only, not in SQL)
- Authentication → URL Configuration → Site URL: `https://talkprint.azaelmontejo.com`
- Redirect URLs: `https://talkprint.azaelmontejo.com/auth/callback`, `http://localhost:3000/auth/callback`
- Authentication → Sign In / Providers → Google: enabled with the Client ID and Client Secret from Google Cloud. Google's Authorized redirect URI is `https://jgekspfpoevweexticap.supabase.co/auth/v1/callback`.

## Known limits and what's next
- Recordings and converted uploads are 32 kbps Opus, about 14 MB/hour. The audio bucket allows 50 MB (Free plan max), about 3.5 hours per file.
- No in-app admin screen yet; invites are SQL.
- Later: Windows desktop app with local WhisperX on the Legion's GPU (free, offline); native Android app for screen-off recording; paid tier at $7.99/mo with a visible hours meter and $0.99/hour top-ups (needs Stripe, Vercel Pro, Supabase Pro first).
- Name: "Talkprint" checked clear on the web, app stores and the USPTO register (Oct 2026). talkprint.com is parked for sale; talkprint.app / .io unverified.

## Related
- Runpod agent setup: https://docs.runpod.io/agent-setup.md. Runpod docs index: https://docs.runpod.io/llms.txt.
