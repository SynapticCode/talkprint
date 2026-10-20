# Talkprint

Private recorder and transcriber. Record on your phone or laptop, or upload a file, and get a transcript that labels who said what. Save voice samples for the people you talk with most and the transcript uses their names.

Will live at https://talkprint.azaelmontejo.com (invite-only, Google sign-in). **Not deployed yet.**

## Stack
- Next.js 15 (App Router) on Vercel
- Supabase: Google sign-in, Postgres, private file storage
- Transcription: self-hosted WhisperX + pyannote on Runpod Serverless (`/worker`, to be built). The current `src/lib/transcribe.ts` still calls OpenAI and is being replaced; see `CLAUDE.md`.

## Run locally
```bash
git clone https://github.com/SynapticCode/talkprint.git
cd talkprint
npm install
cp .env.example .env.local   # then fill in the values
npm run dev
```
Open http://localhost:3000.

## Invite someone
Supabase → SQL Editor:
```sql
insert into public.allowed_users (email, role) values ('person@gmail.com', 'user');
```

## Project context
`CLAUDE.md` holds the decisions, the cost model, architecture, gotchas and the exact next steps. Claude Code reads it automatically.
