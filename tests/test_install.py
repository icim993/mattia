import pathlib
import shutil
import tempfile
import unittest
import sys
import base64
import json
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
from apply_to_repo import install

class InstallTests(unittest.TestCase):
    def test_rejects_admin_keys_before_writing(self):
        payload = base64.urlsafe_b64encode(json.dumps({'role': 'service_role'}).encode()).decode().rstrip('=')
        for key in ['sb_secret_' + 'x' * 48, 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.' + 'x' * 43]:
            with self.subTest(key_type=key[:9]), tempfile.TemporaryDirectory() as dirname:
                base = pathlib.Path(dirname)
                original = ('<title>Arriva Mattia</title>\r\n  <!-- Guestbook -->\r\n'
                            "<script>var SUPABASE_URL='https://example.supabase.co';"
                            f"var SUPABASE_KEY='{key}';</script>").encode()
                (base/'index.html').write_bytes(original)
                with self.assertRaises(RuntimeError): install(base)
                self.assertEqual((base/'index.html').read_bytes(), original)
                self.assertFalse((base/'libro').exists())

    def test_preserves_original_bytes_and_is_idempotent_with_crlf(self):
        from apply_to_repo import PUBLIC_PANEL
        with tempfile.TemporaryDirectory() as dirname:
            base = pathlib.Path(dirname)
            original = ("<title>Arriva Mattia</title>\r\n  <!-- Guestbook -->\r\n"
                        "<script>var SUPABASE_URL='https://example.supabase.co';"
                        "var SUPABASE_KEY='sb_publishable_123456789012345678901234567890';</script>").encode()
            (base/'index.html').write_bytes(original)
            install(base)
            installed = (base/'index.html').read_bytes()
            self.assertEqual(installed.replace((PUBLIC_PANEL+'\n').replace('\n','\r\n').encode(), b'', 1), original)
            install(base)
            self.assertEqual((base/'index.html').read_bytes(), installed)

    def test_adds_album_without_replacing_old_site_and_can_run_twice(self):
        with tempfile.TemporaryDirectory() as dirname:
            base=pathlib.Path(dirname)
            (base/'index.html').write_text('''<!doctype html><title>Arriva Mattia</title>
<section id="messaggi">Guestbook</section>
  <!-- Guestbook -->
<script>var SUPABASE_URL = 'https://example.supabase.co';var SUPABASE_KEY = 'sb_publishable_123456789012345678901234567890123456';</script>''',encoding='utf-8')
            install(base);install(base)
            home=(base/'index.html').read_text(encoding='utf-8')
            self.assertIn('Guestbook',home)
            self.assertEqual(home.count('MATTIA_PRIVATE_ALBUM_V1'),1)
            self.assertIn('href="./libro/"',home)
            self.assertTrue((base/'libro/index.html').exists())
            self.assertTrue((base/'supabase/001_album_privato.sql').exists())
            cfg=(base/'libro/assets/config.js').read_text(encoding='utf-8')
            self.assertIn('https://example.supabase.co',cfg)
            self.assertNotIn('__SUPABASE_',cfg)

    def test_refuses_unrecognized_repo_without_modifying(self):
        with tempfile.TemporaryDirectory() as dirname:
            base=pathlib.Path(dirname);index=base/'index.html'
            index.write_text('<title>Un altro sito</title>',encoding='utf-8')
            with self.assertRaises(RuntimeError): install(base)
            self.assertFalse((base/'libro').exists())
            self.assertEqual(index.read_text(),'<title>Un altro sito</title>')

if __name__=='__main__': unittest.main()
