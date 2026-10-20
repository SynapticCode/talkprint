-- Talkprint initial schema
-- Invite-only access (allowed_users), transcripts, voice samples, private storage,
-- and a keepalive RPC so the free Supabase project never pauses.
-- Pattern copied from lava-intake (is_allowed / is_admin SECURITY DEFINER helpers),
-- simplified so the app never needs the service-role key.

-- ---------------------------------------------------------------------------
-- Allow-list
-- ---------------------------------------------------------------------------
create table if not exists public.allowed_users (
    email       text        primary key,
    role        text        not null default 'user' check (role in ('admin', 'user')),
    created_at  timestamptz not null default now()
);

alter table public.allowed_users enable row level security;

-- SECURITY DEFINER so a normal session can evaluate these even though it
-- cannot read allowed_users. search_path must include auth for the join.
create or replace function public.is_allowed()
returns boolean
language sql stable security definer set search_path = public, auth
as $$
    select exists (
        select 1
          from public.allowed_users a
          join auth.users u on lower(u.email) = lower(a.email)
         where u.id = auth.uid()
    );
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public, auth
as $$
    select exists (
        select 1
          from public.allowed_users a
          join auth.users u on lower(u.email) = lower(a.email)
         where u.id = auth.uid() and a.role = 'admin'
    );
$$;

revoke all on function public.is_allowed() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_allowed() to authenticated;
grant execute on function public.is_admin() to authenticated;

drop policy if exists allowed_users_admin_select on public.allowed_users;
create policy allowed_users_admin_select on public.allowed_users
    for select to authenticated using (public.is_admin());

drop policy if exists allowed_users_admin_modify on public.allowed_users;
create policy allowed_users_admin_modify on public.allowed_users
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Transcripts
-- ---------------------------------------------------------------------------
create table if not exists public.transcripts (
    id                uuid        primary key default gen_random_uuid(),
    user_id           uuid        not null default auth.uid() references auth.users(id) on delete cascade,
    title             text        not null default 'Untitled recording' check (char_length(title) between 1 and 200),
    source            text        not null default 'upload' check (source in ('recording', 'upload')),
    status            text        not null default 'processing' check (status in ('processing', 'done', 'error')),
    audio_path        text,       -- file in the audio bucket; cleared once transcribed (audio is deleted)
    duration_seconds  numeric,
    text              text,
    segments          jsonb,
    error             text,
    created_at        timestamptz not null default now(),
    completed_at      timestamptz
);

create index if not exists transcripts_user_created_idx
    on public.transcripts (user_id, created_at desc);

alter table public.transcripts enable row level security;

drop policy if exists transcripts_own on public.transcripts;
create policy transcripts_own on public.transcripts
    for all to authenticated
    using (user_id = auth.uid() and public.is_allowed())
    with check (user_id = auth.uid() and public.is_allowed());

-- ---------------------------------------------------------------------------
-- Voice samples (OpenAI accepts up to 4 known speakers, 2-10 s each)
-- ---------------------------------------------------------------------------
create table if not exists public.voice_profiles (
    id                uuid        primary key default gen_random_uuid(),
    user_id           uuid        not null default auth.uid() references auth.users(id) on delete cascade,
    name              text        not null check (char_length(name) between 1 and 40),
    storage_path      text        not null,
    duration_seconds  numeric,
    created_at        timestamptz not null default now()
);

alter table public.voice_profiles enable row level security;

drop policy if exists voice_profiles_own on public.voice_profiles;
create policy voice_profiles_own on public.voice_profiles
    for all to authenticated
    using (user_id = auth.uid() and public.is_allowed())
    with check (user_id = auth.uid() and public.is_allowed());

create or replace function public.enforce_voice_profile_limit()
returns trigger
language plpgsql set search_path = public
as $$
begin
    if (select count(*) from public.voice_profiles where user_id = new.user_id) >= 4 then
        raise exception 'You can save up to 4 voice samples. Delete one first.';
    end if;
    return new;
end;
$$;

drop trigger if exists voice_profile_limit on public.voice_profiles;
create trigger voice_profile_limit
    before insert on public.voice_profiles
    for each row execute function public.enforce_voice_profile_limit();

-- ---------------------------------------------------------------------------
-- Usage meter: seconds transcribed this calendar month (UTC) for the caller
-- ---------------------------------------------------------------------------
create or replace function public.monthly_usage_seconds()
returns numeric
language sql stable security invoker set search_path = public
as $$
    select coalesce(sum(duration_seconds), 0)
      from public.transcripts
     where user_id = auth.uid()
       and status = 'done'
       and created_at >= date_trunc('month', now());
$$;

revoke all on function public.monthly_usage_seconds() from public;
grant execute on function public.monthly_usage_seconds() to authenticated;

-- ---------------------------------------------------------------------------
-- Keepalive: one cheap read so the free project never hits the 7-day pause.
-- Callable with the publishable key; returns nothing sensitive.
-- ---------------------------------------------------------------------------
create or replace function public.keepalive()
returns integer
language plpgsql security definer set search_path = public
as $$
begin
    perform 1 from public.allowed_users limit 1;
    return 1;
end;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Storage: private buckets, files live under <user id>/...
-- audio: uploads waiting for transcription (deleted after); voice-samples: kept
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values
    ('audio', 'audio', false, 26214400),          -- 25 MB, OpenAI's per-file limit
    ('voice-samples', 'voice-samples', false, 2097152)
on conflict (id) do nothing;

drop policy if exists talkprint_own_files_select on storage.objects;
create policy talkprint_own_files_select on storage.objects
    for select to authenticated
    using (bucket_id in ('audio', 'voice-samples')
           and (storage.foldername(name))[1] = auth.uid()::text
           and public.is_allowed());

drop policy if exists talkprint_own_files_insert on storage.objects;
create policy talkprint_own_files_insert on storage.objects
    for insert to authenticated
    with check (bucket_id in ('audio', 'voice-samples')
                and (storage.foldername(name))[1] = auth.uid()::text
                and public.is_allowed());

drop policy if exists talkprint_own_files_update on storage.objects;
create policy talkprint_own_files_update on storage.objects
    for update to authenticated
    using (bucket_id in ('audio', 'voice-samples')
           and (storage.foldername(name))[1] = auth.uid()::text
           and public.is_allowed());

drop policy if exists talkprint_own_files_delete on storage.objects;
create policy talkprint_own_files_delete on storage.objects
    for delete to authenticated
    using (bucket_id in ('audio', 'voice-samples')
           and (storage.foldername(name))[1] = auth.uid()::text
           and public.is_allowed());
