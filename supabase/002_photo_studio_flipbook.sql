-- Il libro di Mattia V2: estensione additiva del progetto Supabase esistente.
-- Non modifica le tabelle del Toto-Mattia e non rende pubblico alcun file.

alter table public.album_memories
  add column if not exists page_order integer;

alter table public.album_media
  add column if not exists caption text not null default '';
alter table public.album_media
  add column if not exists layout text not null default 'paper';
alter table public.album_media
  add column if not exists photo_settings jsonb not null default '{}'::jsonb;

-- API: foto personalizzabili solamente dai due proprietari.
-- La lettura resta subordinata alle policy RLS gia' presenti.
grant update on public.album_media to authenticated;

drop policy if exists album_media_owner_update on public.album_media;
create policy album_media_owner_update on public.album_media
  for update to authenticated
  using (album_internal.album_role() = 'owner')
  with check (album_internal.album_role() = 'owner');

-- Vincoli di sicurezza e integrita', anche contro client non ufficiali.
do $$
begin
 if not exists (select 1 from pg_constraint where conname='album_media_layout_valid') then
   alter table public.album_media add constraint album_media_layout_valid
     check (layout in ('full','polaroid','paper','film','gallery','letter'));
 end if;
 if not exists (select 1 from pg_constraint where conname='album_media_caption_length') then
   alter table public.album_media add constraint album_media_caption_length
     check (char_length(caption) <= 220);
 end if;
 if not exists (select 1 from pg_constraint where conname='album_media_photo_settings_object') then
   alter table public.album_media add constraint album_media_photo_settings_object
     check (jsonb_typeof(photo_settings) = 'object');
 end if;
 if not exists (select 1 from pg_constraint where conname='album_media_sort_order_bounds') then
   alter table public.album_media add constraint album_media_sort_order_bounds
     check (sort_order between 0 and 999);
 end if;
 if not exists (select 1 from pg_constraint where conname='album_memories_page_order_bounds') then
   alter table public.album_memories add constraint album_memories_page_order_bounds
     check (page_order is null or page_order between 0 and 999);
 end if;
end $$;

notify pgrst, 'reload schema';
