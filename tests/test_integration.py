"""Phase 1 checks against the actual checkout, without database access."""
import base64
import json
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

class IntegrationTests(unittest.TestCase):
    def test_public_logic_unchanged_and_album_link_only_in_footer(self):
        original = subprocess.check_output([
            'git', '-c', f'safe.directory={ROOT.as_posix()}', 'show', '857d164:index.html'
        ], cwd=ROOT).decode().replace('\r\n', '\n')
        installed = (ROOT/'index.html').read_text(encoding='utf-8')
        self.assertEqual(re.findall(r'<script\b.*?</script>',installed,re.S), re.findall(r'<script\b.*?</script>',original,re.S))
        self.assertNotIn('id="libro-privato"',installed)
        self.assertEqual(installed.count('href="./libro/"'),1)
        footer = re.search(r'<footer>.*?</footer>',installed,re.S)[0]
        self.assertIn('Con tanto affetto da Marco e Angela',footer)
        self.assertIn('♡ Il libro di Mattia · Album privato',footer)
        self.assertIn('href="./libro/"',footer)
        self.assertIn('id="notes" hidden aria-hidden="true"',installed)

    def test_session_settings_and_password_manager_fields(self):
        common = (ROOT/'libro/assets/common.js').read_text(encoding='utf-8')
        self.assertIn('persistSession: true',common)
        self.assertIn('autoRefreshToken: true',common)
        for rel in ['libro/index.html','libro/admin/index.html']:
            html=(ROOT/rel).read_text(encoding='utf-8')
            self.assertIn('autocomplete="username"',html)
            self.assertIn('autocomplete="current-password"',html)
            self.assertLess(html.index('id="password-form"'),html.index('id="google-login"'))
            self.assertNotIn('password-options',html)
        for file in (ROOT/'libro/assets').glob('*.js'):
            self.assertNotRegex(file.read_text(encoding='utf-8'),r'localStorage\.setItem|document\.cookie\s*=')

    def test_config_reuses_existing_public_values(self):
        home = (ROOT/'index.html').read_text(encoding='utf-8')
        config = (ROOT/'libro/assets/config.js').read_text(encoding='utf-8')
        for name in ['SUPABASE_URL', 'SUPABASE_KEY']:
            value = re.search(r'var\s+' + name + r"\s*=\s*'([^']+)'", home)[1]
            self.assertIn(json.dumps(value), config)
        self.assertNotIn('__SUPABASE_', config)

    def test_no_private_media_or_embedded_admin_credentials(self):
        media = []
        tokens = 0
        for file in ROOT.rglob('*'):
            if not file.is_file() or '.git' in file.relative_to(ROOT).parts:
                continue
            if file.suffix.lower() in {'.jpg','.jpeg','.png','.webp','.gif','.heic','.mp4','.mov','.zip'}:
                media.append(file.relative_to(ROOT).as_posix())
            if file.suffix.lower() not in {'.js','.html','.md','.sql','.py','.cjs'}:
                continue
            text = file.read_text(encoding='utf-8')
            for token in re.findall(r'eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+', text):
                payload = token.split('.')[1]
                claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
                self.assertEqual(claims.get('role'), 'anon', file.name)
                tokens += 1
            self.assertFalse(re.search(r'sb_secret_[A-Za-z0-9]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9]{30,}', text), file.name)
        self.assertEqual(tokens, 2)
        self.assertEqual(media, ['libro/assets/copertina.webp'])

if __name__ == '__main__':
    unittest.main()
