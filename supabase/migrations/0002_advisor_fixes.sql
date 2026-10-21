-- Fixes for the Supabase advisor findings after 0001 (2026-10-21).

-- ---------------------------------------------------------------------------
-- authenticated also got REFERENCES, TRIGGER and TRUNCATE by default.
-- TRUNCATE ignores RLS, so keep only the four row-level privileges.
-- ---------------------------------------------------------------------------
revoke all on public.allowed_users, public.transcripts, public.voice_profiles from authenticated;
grant select, insert, update, delete
    on public.allowed_users, public.transcripts, public.voice_profiles
    to authenticated;

-- rls_auto_enable() is Supabase's event-trigger function behind "Enable automatic
-- RLS". The event trigger still fires; nobody should call it through /rpc.
do $$
begin
    if to_regprocedure('public.rls_auto_enable()') is not null then
        revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
    end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS: evaluate auth.uid() and is_allowed() once per query, not once per row.
-- ---------------------------------------------------------------------------
-- The "for all" admin policy already covers select; one policy per action.
drop policy if exists allowed_users_admin_select on public.allowed_users;

drop policy if exists allowed_users_admin_modify on public.allowed_users;
create policy allowed_users_admin_modify on public.allowed_users
    for all to authenticated
    using ((select public.is_admin()))
    with check ((select public.is_admin()));

drop policy if exists transcripts_own on public.transcripts;
create policy transcripts_own on public.transcripts
    for all to authenticated
    using (user_id = (select auth.uid()) and (select public.is_allowed()))
    with check (user_id = (select auth.uid()) and (select public.is_allowed()));

drop policy if exists voice_profiles_own on public.voice_profiles;
create policy voice_profiles_own on public.voice_profiles
    for all to authenticated
    using (user_id = (select auth.uid()) and (select public.is_allowed()))
    with check (user_id = (select auth.uid()) and (select public.is_allowed()));

create index if not exists voice_profiles_user_idx
    on public.voice_profiles (user_id);

drop policy if exists talkprint_own_files_select on storage.objects;
create policy talkprint_own_files_select on storage.objects
    for select to authenticated
    using (bucket_id in ('audio', 'voice-samples')
           and (storage.foldername(name))[1] = (select auth.uid())::text
           and (select public.is_allowed()));

drop policy if exists talkprint_own_files_insert on storage.objects;
create policy talkprint_own_files_insert on storage.objects
    for insert to authenticated
    with check (bucket_id in ('audio', 'voice-samples')
                and (storage.foldername(name))[1] = (select auth.uid())::text
                and (select public.is_allowed()));

drop policy if exists talkprint_own_files_update on storage.objects;
create policy talkprint_own_files_update on storage.objects
    for update to authenticated
    using (bucket_id in ('audio', 'voice-samples')
           and (storage.foldername(name))[1] = (select auth.uid())::text
           and (select public.is_allowed()));

drop policy if exists talkprint_own_files_delete on storage.objects;
create policy talkprint_own_files_delete on storage.objects
    for delete to authenticated
    using (bucket_id in ('audio', 'voice-samples')
           and (storage.foldername(name))[1] = (select auth.uid())::text
           and (select public.is_allowed()));
