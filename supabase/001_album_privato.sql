-- MATTIA | Album privato V1
-- Eseguire nel SQL Editor del progetto Supabase GIA' usato dal Toto-Mattia.
-- Nessuna modifica alle tabelle esistenti: info, bets, messages.
-- IMPORTANTE: eseguire POI il bootstrap dei due proprietari, vedere README.md.

begin;

create table if not exists public.album_access (
  email text primary key,
  display_name text not null default '',
  role text not null check (role in ('owner', 'contributor', 'viewer')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint album_access_email_normalized check (email = lower(btrim(email)) and char_length(email) between 3 and 254 and email like '%@%')
);

-- La membership si basa su auth.users, NON su un indirizzo email fornito dal client.
-- Il login con codice/link email conferma la casella prima di concedere l'accesso.
create or replace function public.album_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select a.role
    from public.album_access as a
    join auth.users as u on lower(u.email) = a.email
   where u.id = (select auth.uid())
     and u.email_confirmed_at is not null
     and a.active is true
   limit 1;
$$;

revoke all on function public.album_role() from public, anon;
grant execute on function public.album_role() to authenticated;

create table if not exists public.album_chapters (
  id smallint primary key,
  slug text not null unique,
  title text not null,
  subtitle text not null default '',
  introduction text not null default '',
  visible boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.album_memories (
  id uuid primary key default gen_random_uuid(),
  chapter_id smallint not null references public.album_chapters(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null default '' check (char_length(body) <= 12000),
  memory_date date not null default current_date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists album_memories_chapter_date on public.album_memories (chapter_id, memory_date desc, created_at desc);

create table if not exists public.album_media (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.album_memories(id) on delete cascade,
  storage_path text not null unique,
  media_kind text not null check (media_kind in ('image', 'video')),
  mime_type text not null,
  sort_order smallint not null default 0,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint album_media_path_check check (length(storage_path) between 25 and 500)
);
create index if not exists album_media_memory on public.album_media (memory_id, sort_order);

create or replace function public.album_touch_memory()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists album_memory_updated on public.album_memories;
create trigger album_memory_updated before update on public.album_memories
for each row execute function public.album_touch_memory();

-- Protezione dalla rimozione dell'ultimo proprietario dell'album.
create or replace function public.album_keep_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'owner' and old.active then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('mattia-album-last-owner')::bigint);
      if (select count(*) from public.album_access where role = 'owner' and active) <= 1 then
        raise exception 'Almeno un proprietario attivo deve rimanere';
      end if;
    end if;
    return old;
  end if;
  if old.role = 'owner' and old.active and (new.role <> 'owner' or new.active = false) then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('mattia-album-last-owner')::bigint);
    if (select count(*) from public.album_access where role = 'owner' and active) <= 1 then
      raise exception 'Almeno un proprietario attivo deve rimanere';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists album_keep_owner_trigger on public.album_access;
create trigger album_keep_owner_trigger before update or delete on public.album_access
for each row execute function public.album_keep_owner();

insert into public.album_chapters (id,slug,title,subtitle,introduction,visible) values
 (1,'prima-di-te','Prima di te','La dolce attesa','La nostra storia insieme a te è iniziata ancora prima di conoscerti.',true),
 (2,'benvenuto','Benvenuto al mondo','Il giorno in cui sei nato','Un giorno che non dimenticheremo mai.',false),
 (3,'primi-giorni','I nostri primi giorni','Casa, abbracci e meraviglia','I piccoli momenti che diventano grandi ricordi.',false),
 (4,'un-anno-con-te','Un anno con te','Dodici mesi di scoperte','Ogni giorno un pezzetto di mondo in più.',false),
 (5,'chi-ti-ama','Le persone che ti amano','Dediche e persone speciali','Parole e ricordi di chi ti vuole bene.',false),
 (6,'per-il-futuro','Per il Mattia di domani','Lettere da conservare','Un giorno leggerai queste parole e scoprirai quanto amore ti aspettava.',false)
on conflict (id) do nothing;

alter table public.album_access enable row level security;
alter table public.album_chapters enable row level security;
alter table public.album_memories enable row level security;
alter table public.album_media enable row level security;

-- Nessuna delle nuove tabelle è leggibile da anon: solo authenticated + RLS.
revoke all on public.album_access, public.album_chapters, public.album_memories, public.album_media from anon;
grant select, insert, update, delete on public.album_access to authenticated;
grant select, update on public.album_chapters to authenticated;
grant select, insert, update, delete on public.album_memories to authenticated;
grant select, insert, delete on public.album_media to authenticated;

-- Gli invitati NON possono consultare la lista di email.
drop policy if exists album_access_owner_select on public.album_access;
create policy album_access_owner_select on public.album_access
for select to authenticated using (public.album_role() = 'owner');
drop policy if exists album_access_owner_insert on public.album_access;
create policy album_access_owner_insert on public.album_access
for insert to authenticated with check (public.album_role() = 'owner');
drop policy if exists album_access_owner_update on public.album_access;
create policy album_access_owner_update on public.album_access
for update to authenticated using (public.album_role() = 'owner') with check (public.album_role() = 'owner');
drop policy if exists album_access_owner_delete on public.album_access;
create policy album_access_owner_delete on public.album_access
for delete to authenticated using (public.album_role() = 'owner');

-- I capitoli nascosti sono visibili solo ai proprietari.
drop policy if exists album_chapters_member_read on public.album_chapters;
create policy album_chapters_member_read on public.album_chapters
for select to authenticated
using (public.album_role() = 'owner' or (public.album_role() in ('viewer','contributor') and visible));
drop policy if exists album_chapters_owner_update on public.album_chapters;
create policy album_chapters_owner_update on public.album_chapters
for update to authenticated using (public.album_role() = 'owner') with check (public.album_role() = 'owner');

-- Solo proprietari e collaboratori possono scrivere. Un collaboratore modifica solo i propri ricordi.
drop policy if exists album_memories_member_read on public.album_memories;
create policy album_memories_member_read on public.album_memories
for select to authenticated using (
  public.album_role() = 'owner'
  or (public.album_role() in ('viewer','contributor') and exists (
    select 1 from public.album_chapters c where c.id = chapter_id and c.visible
  ))
);
drop policy if exists album_memories_author_insert on public.album_memories;
create policy album_memories_author_insert on public.album_memories
for insert to authenticated with check (
  created_by = auth.uid() and (
    public.album_role() = 'owner' or (public.album_role() = 'contributor' and exists (
      select 1 from public.album_chapters c where c.id = chapter_id and c.visible
    ))
  )
);
drop policy if exists album_memories_author_update on public.album_memories;
create policy album_memories_author_update on public.album_memories
for update to authenticated
using (
  public.album_role() = 'owner'
  or (public.album_role() = 'contributor' and created_by = auth.uid()
      and exists (select 1 from public.album_chapters c where c.id = chapter_id and c.visible))
)
with check (
  public.album_role() = 'owner' or (
    public.album_role() = 'contributor' and created_by = auth.uid()
    and exists (select 1 from public.album_chapters c where c.id = chapter_id and c.visible)
  )
);
drop policy if exists album_memories_author_delete on public.album_memories;
create policy album_memories_author_delete on public.album_memories
for delete to authenticated
using (
  public.album_role() = 'owner'
  or (public.album_role() = 'contributor' and created_by = auth.uid()
      and exists (select 1 from public.album_chapters c where c.id = chapter_id and c.visible))
);

-- I media sono disponibili solo per i ricordi visibili al membro attuale.
drop policy if exists album_media_member_read on public.album_media;
create policy album_media_member_read on public.album_media
for select to authenticated using (
  public.album_role() = 'owner' or (
    public.album_role() in ('viewer','contributor') and exists (
      select 1 from public.album_memories m join public.album_chapters c on c.id = m.chapter_id
      where m.id = memory_id and c.visible
    )
  )
);
drop policy if exists album_media_author_insert on public.album_media;
create policy album_media_author_insert on public.album_media
for insert to authenticated with check (
  created_by = auth.uid()
  and split_part(storage_path,'/',1) = auth.uid()::text
  and exists (
    select 1 from public.album_memories m where m.id = memory_id and
      (public.album_role() = 'owner' or (public.album_role() = 'contributor' and m.created_by = auth.uid()
        and exists (select 1 from public.album_chapters c where c.id = m.chapter_id and c.visible)))
  )
);
drop policy if exists album_media_author_delete on public.album_media;
create policy album_media_author_delete on public.album_media
for delete to authenticated using (
  public.album_role() = 'owner' or (public.album_role() = 'contributor' and created_by = auth.uid()
    and exists (select 1 from public.album_memories m join public.album_chapters c on c.id = m.chapter_id
                where m.id = memory_id and c.visible))
);

-- Bucket esclusivamente PRIVATO; non utilizzare il bucket pubblico 'foto' del guestbook.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('mattia-album', 'mattia-album', false, 20971520,
        array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Un client non deve nemmeno poter cambiare il bucket in pubblico o eliminarlo,
-- se esistessero policy legacy troppo permissive su storage.buckets.
drop policy if exists mattia_album_bucket_no_anon_update on storage.buckets;
create policy mattia_album_bucket_no_anon_update on storage.buckets
as restrictive for update to anon using (id <> 'mattia-album') with check (id <> 'mattia-album');
drop policy if exists mattia_album_bucket_no_auth_update on storage.buckets;
create policy mattia_album_bucket_no_auth_update on storage.buckets
as restrictive for update to authenticated using (id <> 'mattia-album') with check (id <> 'mattia-album');
drop policy if exists mattia_album_bucket_no_anon_delete on storage.buckets;
create policy mattia_album_bucket_no_anon_delete on storage.buckets
as restrictive for delete to anon using (id <> 'mattia-album');
drop policy if exists mattia_album_bucket_no_auth_delete on storage.buckets;
create policy mattia_album_bucket_no_auth_delete on storage.buckets
as restrictive for delete to authenticated using (id <> 'mattia-album');

-- Difesa in profondita': eventuali policy Storage gia' esistenti e molto larghe
-- (create per il guestbook pubblico) non devono aprire per errore questo bucket.
-- Le policy RLS PostgreSQL permissive sono in OR; queste RESTRICTIVE sono in AND.
-- Fuori dal nuovo bucket il loro effetto e' nullo.
drop policy if exists mattia_album_guard_anon_select on storage.objects;
create policy mattia_album_guard_anon_select on storage.objects
as restrictive for select to anon using (bucket_id <> 'mattia-album');
drop policy if exists mattia_album_guard_anon_insert on storage.objects;
create policy mattia_album_guard_anon_insert on storage.objects
as restrictive for insert to anon with check (bucket_id <> 'mattia-album');
drop policy if exists mattia_album_guard_anon_update on storage.objects;
create policy mattia_album_guard_anon_update on storage.objects
as restrictive for update to anon using (bucket_id <> 'mattia-album') with check (bucket_id <> 'mattia-album');
drop policy if exists mattia_album_guard_anon_delete on storage.objects;
create policy mattia_album_guard_anon_delete on storage.objects
as restrictive for delete to anon using (bucket_id <> 'mattia-album');

drop policy if exists mattia_album_guard_auth_select on storage.objects;
create policy mattia_album_guard_auth_select on storage.objects
as restrictive for select to authenticated using (
  bucket_id <> 'mattia-album'
  or public.album_role() = 'owner'
  or (public.album_role() in ('viewer','contributor') and exists (
    select 1 from public.album_media am
    join public.album_memories m on m.id = am.memory_id
    join public.album_chapters c on c.id = m.chapter_id
    where am.storage_path = storage.objects.name and c.visible
  ))
);
drop policy if exists mattia_album_guard_auth_insert on storage.objects;
create policy mattia_album_guard_auth_insert on storage.objects
as restrictive for insert to authenticated with check (
  bucket_id <> 'mattia-album' or (
    public.album_role() in ('owner','contributor') and
    split_part(name, '/', 1) = auth.uid()::text
  )
);
drop policy if exists mattia_album_guard_auth_update on storage.objects;
create policy mattia_album_guard_auth_update on storage.objects
as restrictive for update to authenticated
using (bucket_id <> 'mattia-album')
with check (bucket_id <> 'mattia-album');
drop policy if exists mattia_album_guard_auth_delete on storage.objects;
create policy mattia_album_guard_auth_delete on storage.objects
as restrictive for delete to authenticated using (
  bucket_id <> 'mattia-album'
  or public.album_role() = 'owner'
  or (public.album_role() = 'contributor' and split_part(name, '/', 1) = auth.uid()::text)
);

drop policy if exists mattia_album_private_read on storage.objects;
create policy mattia_album_private_read on storage.objects
for select to authenticated using (
  bucket_id = 'mattia-album' and (
    public.album_role() = 'owner' or
    (public.album_role() in ('viewer','contributor') and exists (
      select 1 from public.album_media am
      join public.album_memories m on m.id = am.memory_id
      join public.album_chapters c on c.id = m.chapter_id
      where am.storage_path = storage.objects.name and c.visible
    ))
  )
);
drop policy if exists mattia_album_author_upload on storage.objects;
create policy mattia_album_author_upload on storage.objects
for insert to authenticated with check (
  bucket_id = 'mattia-album'
  and public.album_role() in ('owner','contributor')
  and split_part(name, '/', 1) = auth.uid()::text
);
drop policy if exists mattia_album_author_delete on storage.objects;
create policy mattia_album_author_delete on storage.objects
for delete to authenticated using (
  bucket_id = 'mattia-album' and (
    public.album_role() = 'owner' or
    (public.album_role() = 'contributor' and split_part(name, '/', 1) = auth.uid()::text)
  )
);

commit;

-- ATTIVAZIONE PROPRIETARI (nel SQL Editor, una sola volta e con email autentiche):
-- insert into public.album_access (email, display_name, role)
-- values ('email.marco@esempio.it','Marco','owner'),
--        ('email.angela@esempio.it','Angela','owner');
-- Prima di eseguire, sostituire questi segnaposto: NON inserirli come indirizzi reali.
