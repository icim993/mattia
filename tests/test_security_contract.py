from pathlib import Path
import unittest
sql=(Path(__file__).resolve().parents[1]/'supabase/001_album_privato.sql').read_text()

class ContractTests(unittest.TestCase):
  def test_private_storage_and_protected_tables(self):
    for table in ['album_access','album_chapters','album_memories','album_media']:
      assert f'alter table public.{table} enable row level security;' in sql
    assert "values ('mattia-album', 'mattia-album', false" in sql
    assert "bucket_id = 'mattia-album'" in sql
    assert "join auth.users as u" in sql
    assert 'u.email_confirmed_at is not null' in sql
    assert 'revoke all on public.album_access' in sql
    assert "('owner', 'contributor', 'viewer')" in sql
  def test_new_bucket_is_protected_against_preexisting_broad_storage_policies(self):
    # PostgreSQL RLS permissive policies are ORed. A legacy policy for a
    # public guestbook must never grant access to the album by accident.
    for role in ('anon','auth'):
      for op in ('select','insert','update','delete'):
        assert f'mattia_album_guard_{role}_{op}' in sql
    assert sql.count('as restrictive') >= 8

  def test_delete_private_file_before_metadata(self):
    admin=(Path(__file__).resolve().parents[1]/'libro/assets/admin.js').read_text()
    start=admin.index('async function removeMedia(item)')
    end=admin.index('async function deleteMemory(memory)',start)
    logic=admin[start:end]
    assert logic.index("storage.from('mattia-album').remove") < logic.index("from('album_media').delete()")

  def test_no_legacy_table_changes(self):
    for table in ['info','bets','messages']:
      assert f'alter table public.{table}' not in sql
      assert f'drop table public.{table}' not in sql
  def test_no_service_role_frontend(self):
    root=Path(__file__).resolve().parents[1]/'libro/assets'
    for file in root.glob('*.js'):
      assert 'service_role' not in file.read_text().lower() or file.name=='config.js' # warning comments permitted

if __name__=='__main__':unittest.main()
