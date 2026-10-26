#!/usr/bin/env python3
"""Aggiunge il libro privato a un checkout esistente di icim993/mattia.

Uso: python apply_to_repo.py /percorso/del/repository/mattia
Non crea un nuovo sito o un nuovo progetto Supabase.
"""
from __future__ import annotations
import argparse
import base64
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent
MARKER = '<!-- MATTIA_PRIVATE_ALBUM_V1 -->'
PUBLIC_PANEL = '''\n  <!-- MATTIA_PRIVATE_ALBUM_V1 -->
  <section id="libro-privato" aria-labelledby="libro-privato-title">
    <p class="eyebrow">Il nostro album di famiglia</p>
    <h2 id="libro-privato-title">Il libro di Mattia</h2>
    <p class="lead">Una storia fatta di ricordi, parole e fotografie autentiche.
       L'album è riservato a Marco, Angela e alle persone invitate da loro.</p>
    <div class="btns"><a class="btn" href="./libro/">Apri il libro privato ♡</a></div>
  </section>
'''


def install(destination: Path) -> None:
    target = destination.resolve()
    index = target / 'index.html'
    if not index.is_file():
        raise RuntimeError(f'index.html non trovato in {target}; indica la directory del repository originale.')
    html = index.read_bytes().decode('utf-8')
    newline = '\r\n' if '\r\n' in html else '\n'
    if '<title>Arriva Mattia</title>' not in html or 'var SUPABASE_URL' not in html:
        raise RuntimeError('Il file index.html non sembra essere quello del repository verificato. Nessuna modifica applicata.')

    url_m = re.search(r'var\s+SUPABASE_URL\s*=\s*([\'"])(.*?)\1', html)
    key_m = re.search(r'var\s+SUPABASE_KEY\s*=\s*([\'"])(.*?)\1', html)
    if not url_m or not key_m:
        raise RuntimeError('Configurazione Supabase non trovata: non posso collegare i due progetti.')
    url, key = url_m.group(2), key_m.group(2)
    if not url.startswith('https://') or len(key) < 40:
        raise RuntimeError('Configurazione pubblica Supabase non valida nel vecchio sito.')
    if not key.startswith('sb_publishable_'):
        try:
            payload = key.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
        except (ValueError, IndexError, UnicodeError) as ex:
            raise RuntimeError('Chiave Supabase non riconosciuta come pubblica.') from ex
        if not isinstance(claims, dict) or claims.get('role') != 'anon':
            raise RuntimeError('Rifiutata chiave Supabase non pubblica: richiesta anon/publishable.')

    if MARKER not in html:
        anchor = '  <!-- Guestbook -->'
        if anchor not in html:
            raise RuntimeError('Non trovo il punto sicuro in cui aggiungere il collegamento. Nessuna modifica applicata.')
        html = html.replace(anchor, (PUBLIC_PANEL + '\n').replace('\n', newline) + anchor, 1)

    files = [
        'libro/index.html', 'libro/admin/index.html',
        'libro/assets/style.css', 'libro/assets/common.js', 'libro/assets/album.js',
        'libro/assets/admin.js', 'libro/assets/copertina.webp',
        'supabase/001_album_privato.sql',
    ]
    for rel in files:
        src, dest = ROOT / rel, target / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        if src.resolve() != dest.resolve():
            shutil.copy2(src, dest)

    # La anon/publishable key è pubblica per definizione; NON è la service_role key.
    # Si recuperano url/key direttamente dall'HTML già pubblicato, senza inventare un DB.
    def quote_js(value: str) -> str:
        # Assicura quoting JS robusto, anche se in futuro cambiano i caratteri della key.
        import json
        return json.dumps(value, ensure_ascii=False)
    config = ("// Configurazione PUBBLICA condivisa con il Toto-Mattia.\n"
              "// NON inserire mai una service_role key in questo file.\n"
              f"window.MATTIA_CONFIG = {{ url: {quote_js(url)}, anonKey: {quote_js(key)} }};\n")
    (target / 'libro/assets/config.js').write_text(config, encoding='utf-8')
    index.write_bytes(html.encode('utf-8'))
    doc = ROOT / 'README-ALBUM.md'
    if not doc.is_file():
        doc = ROOT / 'README.md'
    if doc.resolve() != (target / 'README-ALBUM.md').resolve():
        shutil.copy2(doc, target / 'README-ALBUM.md')

    print('Installazione locale completata senza modificare le funzionalita pubbliche.')
    print('Creati: libro/, supabase/001_album_privato.sql, README-ALBUM.md')
    print('Modificato: index.html (link al libro; idempotente).')
    print('DATABASE NON MODIFICATO: applicare SQL + bootstrap due email nel dashboard Supabase.')
    print('GITHUB NON MODIFICATO: eseguire git add, commit e push quando pronto.')


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('repo', help='Percorso del repository mattia già clonato')
    args = parser.parse_args()
    try:
        install(Path(args.repo)); return 0
    except (OSError, RuntimeError) as ex:
        print('Errore:', ex, file=sys.stderr); return 1

if __name__ == '__main__':
    raise SystemExit(main())
