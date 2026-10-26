"""Phase 1 checks against the actual checkout, without database access."""
import base64
import json
from pathlib import Path
import re
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]

class IntegrationTests(unittest.TestCase):
    def test_existing_home_changes_only_album_link_and_requested_privacy(self):
        original = subprocess.check_output([
            'git', '-c', f'safe.directory={ROOT.as_posix()}', 'show', 'f164866:index.html'
        ], cwd=ROOT).decode().replace('\r\n', '\n')
        installed = (ROOT/'index.html').read_text(encoding='utf-8')
        installed = installed.replace(' Testi e fotografie sono privati e visibili solo ai genitori, Marco e Angela. Nomi e canzoni restano nella playlist pubblica.', '')
        installed = installed.replace('<div id="notes" hidden aria-hidden="true"></div>', '<div id="notes"><div class="empty">Caricamento dei messaggi…</div></div>')
        installed = installed.replace("sb.from('messages').select('nome,canzone,created_at')", "sb.from('messages').select('*')")
        restored, count = re.subn(
            r'\n\n  <!-- MATTIA_PRIVATE_ALBUM_V1 -->.*?</section>\n\n(?=  <!-- Guestbook -->)',
            '\n', installed, count=1, flags=re.S)
        self.assertEqual(count, 1)
        self.assertEqual(restored, original)

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
