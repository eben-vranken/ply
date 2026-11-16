-- Ply accounts and sync (docs/DECISIONS.md, "Sync"). Run once in the Supabase SQL editor.
--
-- One table per synced IndexedDB table. Each row is the app's row as `data` (jsonb), keyed by
-- the user and the row's natural key, with the client's change time `updated_at` (ms since
-- the epoch) and a `deleted` tombstone. `seq` and `synced_at` are set by the server on every
-- write and are what a device pulls by ("rows changed since my last sync").
--
-- The server refuses a write that is older than the row it holds, by the same rules the app
-- merges with (app/src/lib/cloud/merge.ts): cards keep the later FSRS review, the settings row
-- merges one setting at a time, everything else keeps the later updated_at, and a tie keeps
-- what the server has. So a device that pushes stale data cannot overwrite newer progress
-- from another device.
--
-- Row Level Security: a signed-in user reads and writes only rows with their own user_id.
-- The opening data (the app's `data` table) is never synced.

create sequence if not exists public.ply_sync_seq;

-- every accepted write gets a new seq and server time
create or replace function public.ply_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.seq := nextval('public.ply_sync_seq');
  new.synced_at := clock_timestamp();
  return new;
end $$;

-- last write wins by updated_at; a tie keeps the stored row. Returning null skips the update.
create or replace function public.ply_keep_newer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.updated_at <= old.updated_at then return null; end if;
  return new;
end $$;

-- cards: the version with the later FSRS last_review wins, then updated_at. Deletions compare
-- by updated_at only, so a deletion beats older edits and a later review beats the deletion.
create or replace function public.ply_keep_newer_card() returns trigger
language plpgsql set search_path = '' as $$
declare
  n timestamptz;
  o timestamptz;
begin
  if not new.deleted and not old.deleted then
    n := coalesce((new.data -> 'fsrs' ->> 'last_review')::timestamptz, '-infinity');
    o := coalesce((old.data -> 'fsrs' ->> 'last_review')::timestamptz, '-infinity');
    if n < o then return null; end if;
    if n > o then return new; end if;
  end if;
  if new.updated_at <= old.updated_at then return null; end if;
  return new;
end $$;

-- settings: the "app" row ({value, stamps}) merges one setting at a time, the later stamp
-- winning and a tie keeping the stored one (mergeApp in merge.ts). Other rows: last write wins.
create or replace function public.ply_merge_settings() returns trigger
language plpgsql set search_path = '' as $$
declare
  k text;
  v jsonb;
  s jsonb;
  so bigint;
  sb bigint;
  changed boolean := false;
begin
  if new.key <> 'app' or new.deleted or old.deleted or new.data is null or old.data is null then
    if new.updated_at <= old.updated_at then return null; end if;
    return new;
  end if;
  v := coalesce(old.data -> 'value', '{}');
  s := coalesce(old.data -> 'stamps', '{}');
  for k in select jsonb_object_keys(coalesce(new.data -> 'value', '{}')) loop
    so := coalesce((new.data -> 'stamps' ->> k)::bigint, 0);
    sb := case when v ? k then coalesce((s ->> k)::bigint, 0) else -1 end;
    if so > sb then
      v := jsonb_set(v, array[k], new.data -> 'value' -> k);
      s := jsonb_set(s, array[k], to_jsonb(so));
      changed := true;
    end if;
  end loop;
  if not changed then return null; end if;
  new.data := jsonb_build_object('value', v, 'stamps', s);
  new.updated_at := greatest(new.updated_at, old.updated_at);
  return new;
end $$;

create table if not exists public.settings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default 0,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, key)
);

create table if not exists public.repertoire (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  side text not null check (side in ('w', 'b')),
  epd text not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default 0,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, side, epd)
);

create table if not exists public.book (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  side text not null check (side in ('w', 'b')),
  epd text not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default 0,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, side, epd)
);

create table if not exists public.cards (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default 0,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);

create table if not exists public.reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id text not null,
  at bigint not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default 0,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, card_id, at)
);

create table if not exists public.games (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url text not null,
  data jsonb,
  updated_at bigint not null,
  deleted boolean not null default false,
  seq bigint not null default 0,
  synced_at timestamptz not null default clock_timestamp(),
  primary key (user_id, url)
);

-- triggers fire in name order: a_ decides whether the write is kept, b_ stamps it
do $$
declare t text;
begin
  foreach t in array array['settings', 'repertoire', 'book', 'cards', 'reviews', 'games'] loop
    execute format('create index if not exists %1$s_pull on public.%1$I (user_id, synced_at)', t);
    execute format('drop trigger if exists a_keep_newer on public.%I', t);
    execute format('create trigger a_keep_newer before update on public.%I for each row execute function public.%s()',
      t, case t when 'cards' then 'ply_keep_newer_card' when 'settings' then 'ply_merge_settings' else 'ply_keep_newer' end);
    execute format('drop trigger if exists b_stamp on public.%I', t);
    execute format('create trigger b_stamp before insert or update on public.%I for each row execute function public.ply_stamp()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Settings → Account → Delete my account and synced data. Deleting the auth user removes every
-- row above (on delete cascade). Data on the user's devices is not touched.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
