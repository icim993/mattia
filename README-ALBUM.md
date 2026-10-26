# Il libro di Mattia — integrazione V1

## Aggiornamento privacy — 26 ottobre 2026

Il progetto Supabase esistente è già stato aggiornato dal proprietario: **non eseguire nuovamente SQL o migrazioni**. Le istruzioni SQL più sotto restano come riferimento per installazioni nuove. `messages` è ora una vista pubblica per nomi/canzoni e invio dediche; testo e foto restano NULL nelle letture pubbliche. `guestbook_private` è la fonte originale accessibile solo agli owner. Entrambi i bucket `foto` e `mattia-album` sono privati.

La home mantiene l'elemento `#notes` nel DOM ma lo nasconde completamente. Il modulo continua a inviare dediche e foto; nomi e canzoni alimentano la playlist. Nell'amministrazione del libro la nuova **Bacheca privata** carica le dediche solo dopo la verifica del ruolo owner. Le vecchie URL delle foto sono convertite in percorsi del bucket `foto`: le immagini vengono scaricate con la sessione autenticata e mostrate tramite Blob URL temporanei, rimossi all'uscita o al cambio di accesso. Non vengono interrogate o mostrate a lettori, collaboratori o anonimi.

Verifiche: 12 test Python e 24 scenari browser desktop/mobile, compresi invio dediche con foto, scommesse, salvataggio album, accessi alla bacheca, download autenticati, errore della bacheca senza blocco dell'album e pulizia all'uscita. I test browser usano dati simulati; `tests/live_public_check.py` verifica in sola lettura la vista pubblica e l'assenza di contenuti privati per anonimi sul progetto reale. Nessuna migrazione viene eseguita da questi controlli.

**Progetto di destinazione:** `https://github.com/icim993/mattia` (sito pubblico Toto-Mattia già esistente).

Questo pacchetto aggiunge un album digitale riservato, con copertina senza immagini artificiali del neonato, capitoli, fotografie autentiche, video brevi, ricordi testuali e inviti a familiari. **Non richiede un nuovo progetto Supabase.** La pagina già condivisa resta al medesimo URL e riceve soltanto un nuovo collegamento al libro.

## Cosa contiene

- `libro/`: album pubblico come *interfaccia*, ma contenuti effettivi disponibili esclusivamente ad utenti autenticati e autorizzati nel database (RLS).
- `libro/admin/`: pannello per genitori e collaboratori con permessi limitati.
- `supabase/001_album_privato.sql`: nuove tabelle, policy RLS, ruoli e bucket **privato** `mattia-album`.
- `apply_to_repo.py`: installazione locale che copia i file, riutilizza la URL e la chiave **anon/publishable** già presenti nell'attuale `index.html` e aggiunge un collegamento alla pagina pubblica senza cancellare le funzionalità esistenti.
- `libro/assets/copertina.webp`: copertina grafica senza ritratto di un neonato reale o sintetico.

## INSTALLAZIONE — nell'ordine seguente

### 1. Prepara una copia del repository esistente

Clona `https://github.com/icim993/mattia` oppure usa la cartella in cui hai già il repository. Non è necessario cambiare URL, hosting, né creare un nuovo repository.

### 2. Integra i file nel repository

Scarica questo pacchetto ZIP, estrailo, poi da terminale esegui:

```bash
python apply_to_repo.py "/percorso/del/tuo/repo/mattia"
```

Su Windows, per esempio:

```powershell
py .\apply_to_repo.py "C:\Users\TUO_UTENTE\Documents\mattia"
```

L'installatore richiede la versione originale dell'`index.html` con `SUPABASE_URL` e `SUPABASE_KEY`: riutilizza quegli stessi valori **pubblici** e scrive automaticamente `libro/assets/config.js`. Non copia dati personali e non altera `info`, `bets`, `messages` o il bucket già utilizzato dal guestbook.

Il comando è idempotente: può essere ripetuto senza duplicare il collegamento nella home.

### 3. Installa la parte privata nel progetto Supabase **già esistente**

Nel dashboard Supabase del sito Mattia, apri **SQL Editor**, incolla **tutto** il contenuto di `supabase/001_album_privato.sql` e avvia. Verranno create soltanto tabelle con prefisso `album_` e il bucket privato `mattia-album`.

**Non pubblicare foto personali nella vecchia area/bucket pubblico `foto`.** Il nuovo album usa solo `mattia-album`, che viene configurato come privato e protetto tramite RLS.

### 4. Attiva gli indirizzi di Marco e Angela

Dopo la migrazione, apri SQL Editor ed esegui questo comando **sostituendo i due esempi con gli indirizzi email reali**:

```sql
insert into public.album_access (email, display_name, role)
values
  ('INDIRIZZO_EMAIL_REALE_DI_MARCO', 'Marco', 'owner'),
  ('INDIRIZZO_EMAIL_REALE_DI_ANGELA', 'Angela', 'owner')
on conflict (email) do update set display_name=excluded.display_name, role='owner', active=true;
```

**Importante:** inserisci gli indirizzi in minuscolo, esattamente come saranno usati per il login. Non lasciare i segnaposto nel comando. Chiunque entri con un'email non presente o revocata viene bloccato da Supabase, non soltanto da una pagina HTML.

### 5. Configura l'autenticazione (tre modalità disponibili)

**È indispensabile attivare almeno un metodo di accesso reale.** Il frontend offre Google, email magic link/OTP, e password individuale. Tutti e tre richiedono comunque che l'indirizzo autenticato sia nella tabella `album_access`.

**A — Consigliato: accedi con Google (senza invio email SMTP).**

1. Nel dashboard Supabase → **Authentication → Providers → Google** abilita il provider.
2. Nel Google Auth Platform Console crea un client OAuth di tipo **Web application**. Aggiungi l'origine del sito come **Authorized JavaScript origin** (es. `https://icim993.github.io`, non un percorso).
3. Aggiungi come **Authorized redirect URI** il callback del **progetto Supabase**, visibile nella scheda del provider Google (tipicamente `https://<REF>.supabase.co/auth/v1/callback`).
4. Copia Client ID e Client Secret nel dashboard Supabase, **mai in GitHub o nel frontend**.
5. Nel dashboard Supabase → **Authentication → URL Configuration**, aggiungi l'URL effettivo dell'album (es. `https://icim993.github.io/mattia/libro/` se questo è davvero il dominio GitHub Pages del sito), poi prova con un account autorizzato.

Se il progetto Google è in modalità testing, verifica che gli utenti previsti siano ammessi dalle impostazioni del consenso OAuth. Il provider Google è una scelta pratica quando i familiari possiedono un account Google, ma richiede questa configurazione una tantum.

**B — Email + password personale già impostata da un amministratore.**

Quando non vuoi configurare email SMTP e i familiari non usano Google, puoi creare gli account individuali da un ambiente amministrativo sicuro Supabase (Dashboard/Auth Admin) con una password robusta e l'email confermata dall'amministratore **solo dopo aver verificato davvero l'identità e la titolarità dell'indirizzo**. Non abilitare l'auto-conferma pubblica delle email: permetterebbe di impersonare indirizzi presenti nella lista inviti. La password non va scritta nel codice o condivisa pubblicamente. La schermata dell'album supporta `signInWithPassword`.

**C — Magic link / OTP via email (richiede SMTP per i familiari esterni).**

Nel dashboard Supabase → **Authentication → URL Configuration** aggiungi l'URL dell'album ai Redirect URLs. Controlla che il provider email sia attivo. ATTENZIONE: il server email predefinito Supabase invia a indirizzi del team del progetto soltanto ed è limitato (attualmente a 2 email/ora). **Per inviare magic link ai nonni o amici non appartenenti al team del progetto è necessario configurare un SMTP personalizzato** (oppure un Send Email Hook). Non serve un altro database; puoi scegliere un provider con piano gratuito, verificando le condizioni del provider. I template predefiniti inviano un magic link, mentre i template basati su `{{ .Token }}` inviano il codice OTP.

**Non usare mai la `service_role` / secret key nel sito**: solo la publishable/anon key pubblica già presente nel Toto-Mattia.

### 6. Pubblica nello stesso repository

Dalla cartella del repository:

```bash
git add index.html libro supabase README-ALBUM.md
git commit -m "Add private family book with Supabase Auth and RLS"
git push origin main
```

Quando GitHub Pages pubblica la nuova versione, il link originale al Toto-Mattia continua a funzionare e mostra il nuovo pulsante "Apri il libro privato". L'album sarà raggiungibile aggiungendo `/libro/` al percorso del sito esistente.

## Utilizzo e inviti

1. Marco o Angela apre il libro e usa Google, password personale o, se configurato SMTP, il magic link ricevuto via email.
2. Dal pannello "Gestisci" aggiunge l'indirizzo email di un nonno e sceglie lettore/collaboratore.
3. Copia l'URL del libro e lo invia via WhatsApp o email. L'inserimento nell'elenco autorizzati **non invia automaticamente un invito**.
4. Il nonno apre lo stesso link, entra con Google, password personale oppure magic link (se SMTP è configurato) e accede soltanto se è stato autorizzato.
5. I genitori possono revocare o riattivare gli accessi; le policy vengono controllate a ogni nuova richiesta di dati. Copie già salvate dal destinatario non sono revocabili.

### Capitoli

Nella configurazione iniziale il capitolo 1 (*Prima di te*) è visibile agli invitati; gli altri sono predisposti ma nascosti e visibili solo ai genitori. Potrete aprirli tramite la sezione "Apri i capitoli" nel pannello di gestione. Data e informazioni di nascita reali non vengono inventate.

## Dettagli sulla privacy

- `album_role()` verifica la corrispondenza tra l'email **confermata** in `auth.users` e la lista dei permessi attivi.
- Le tabelle `album_*` hanno RLS attiva: nessuna lettura anonima. I proprietari possono invitare/revocare, gestire i capitoli e modificare tutto; i collaboratori scrivono/modificano i propri ricordi nei capitoli visibili; i lettori possono soltanto sfogliare i capitoli aperti.
- Le policy Storage includono ulteriori vincoli **RESTRICTIVE** per evitare che eventuali vecchie policy permissive del guestbook (su `storage.objects`) allarghino inavvertitamente i permessi del nuovo bucket. **Da verificare comunque nel progetto reale prima della pubblicazione.**
- Il bucket `mattia-album` è **privato**. Per mostrare foto e video il client fa download autenticati via RLS (Blob URL locali); non crea link pubblici o signed URL permanenti.
- Il repository GitHub resta pubblico ma contiene **solo codice e immagini decorative senza persone**. Foto e video reali non sono salvati nel repository.
- Il frontend usa esclusivamente l'anon/publishable key già pubblica, mai una `service_role` key, né password o credenziali amministrative.
- L'accesso all'URL **non equivale** ad autorizzazione. Anche un utente autenticato ma non invitato non può leggere i ricordi.
- La sola autenticazione via email non è un sistema di protezione assoluto contro dispositivi compromessi o foto già scaricate: evitate informazioni mediche o dati altamente sensibili senza misure aggiuntive.

## Limiti noti V1

- Foto convertite in JPG e ridotte a massimo 1920 px sul lato lungo; il formato HEIC dipende dalla capacità del browser di aprirlo. Se non funziona, converti la foto in JPG.
- Video MP4/MOV massimo 20 MB per file, 10 file per operazione; per video lunghi serve una soluzione di archiviazione/compressione più evoluta.
- Nessuna esportazione PDF, nessun audio, nessun invito email automatizzato nella V1: sono sviluppi successivi.
- Non è stato possibile eseguire migrazioni o test RLS sul progetto Supabase reale da questo ambiente: **prima di condividere immagini vere, fare le verifiche descritte sotto.**

## Collaudo sicurezza obbligatorio

1. Apri il vecchio sito da anonimo: Toto-Mattia, messaggi e classifica devono essere ancora funzionanti.
2. Da anonimo apri `/libro/`: non devono comparire capitoli e media privati. Verifica che il pulsante Google funzioni **solo dopo** la configurazione del provider.
3. Accedi con un account email **non autorizzato**: deve apparire "Questo libro è riservato".
4. Accedi come Marco: pannello gestione visibile, caricamento di un ricordo di prova e una foto non sensibile funzionante.
5. Invita un account diverso come `viewer`: deve vedere soltanto capitoli aperti, non il pannello di gestione.
6. Revoca il `viewer`, ricarica la pagina, verifica che non possa più scaricare nuovi contenuti via URL o API.
7. Invita un account `contributor`: può aggiungere un ricordo, non modificare quelli creati dai genitori né vedere l'elenco email.
8. Nel Dashboard Storage verifica che il bucket `mattia-album` sia **Private**; verificare che nessuna foto di prova abbia un URL pubblico funzionante.
9. Riavvia il browser e ripeti i test con le nuove sessioni. Soltanto dopo carica fotografie familiari reali.

## Backup

Supabase Free ha limiti di storage, email e traffico soggetti a cambiamenti. Per un libro di ricordi decennale non affidarti all'unica copia nel cloud: scarica periodicamente foto originali e un export di tabelle e conservali in un backup cifrato anche fuori dal progetto Supabase.

---

**Stato FASE 1 — 26 ottobre 2026:** integrazione locale completata sul checkout di `icim993/mattia`, commit di partenza `f164866`. Nessun commit, push o modifica al database è stato eseguito, come richiesto dall'utente.

La home contiene soltanto il nuovo pannello di collegamento (10 righe aggiunte). Un test confronta il resto del file con il commit di partenza `f164866`: Toto-Mattia, guestbook, playlist e annuncio della nascita sono invariati. La configurazione dell'album riusa esattamente URL e chiave pubblica `anon` della home. L'installatore ora rifiuta chiavi amministrative, conserva i fine riga e può essere rieseguito nel checkout integrato.

Verifiche eseguite:

- 12 test Python superati: installazione, idempotenza, rifiuto chiavi amministrative, conservazione della home, configurazione condivisa, file multimediali e contratti statici RLS.
- 20 scenari browser Playwright superati a 1366 e 390 pixel, con dati simulati: home prima/dopo la nascita, guestbook, playlist, validazioni dei moduli, album anonimo/non invitato/lettore/proprietario, pannello lettore/collaboratore/proprietario e migrazione mancante. Tutti i link e asset locali rispondono 200 sotto il prefisso `/mattia/`.
- Sintassi JavaScript e `git diff --check` superati.
- Nei file del checkout non risultano chiavi amministrative incorporate. I due JWT pubblici hanno ruolo `anon`. L'unico file multimediale è la copertina decorativa WebP, controllata visivamente: nessuna fotografia di persone.
- Controllo HTTP del sito attualmente pubblicato: home 200, SDK Supabase CDN 200, `/mattia/libro/` e `/mattia/libro/admin/` 404. I nuovi percorsi non sono ancora pubblicati.

I test browser intercettano le risorse esterne e usano un client Supabase simulato: non validano i permessi del progetto reale e non effettuano scritture remote. Restano da collaudare dopo l'approvazione e la migrazione: autenticazione reale e URL di redirect, RLS con account distinti, revoca degli inviti e upload/download nel bucket privato. Il file SQL è soltanto predisposto, non applicato. Nessun errore rimane nei controlli locali; i 404 del nuovo album online sono attesi in questa fase.

Per ripetere i test dalla directory del checkout:

```powershell
python -m unittest discover -s tests -p 'test_*.py' -v
# Richiede Playwright disponibile per Node.js (eventualmente tramite NODE_PATH).
# Se necessario, impostare PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH al browser locale.
node tests/pages_smoke.cjs
git diff --check
```

La verifica di conservazione della home usa `f164866:index.html` come riferimento della FASE 1; eventuali modifiche future alla home richiederanno di aggiornare questa verifica.
