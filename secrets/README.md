# Sekrety lokalne

Pliki z tego katalogu nie są śledzone przez Git. Do lokalnego uruchomienia utwórz sześć plików zawierających wyłącznie silne, niezależne hasła:

```text
secrets/postgres_admin_password
secrets/db_password
secrets/redis_password
secrets/supervisor_password
secrets/ksef_encryption_key
secrets/smtp_password
```

`ksef_encryption_key` musi zawierać 32 losowe bajty zakodowane w base64 (klucz AES-256-GCM do szyfrowania tokenów KSeF w bazie). Wygeneruj go poleceniem:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

`smtp_password` to hasło prawdziwej skrzynki pocztowej (np. `biuro@epito.pl` w Zimbrze/OVH), używanej do wysyłki zgłoszeń pilotażu i przypomnień o płatnościach bezpośrednio przez SMTP tej skrzynki — bez pośrednika w rodzaju Resend. Lokalnie, jeśli nie testujesz wysyłki e-mail, plik może zostać pusty (worker to wykryje i po prostu pominie wysyłkę, zaloguje ostrzeżenie). Adres skrzynki i host SMTP ustawia się zmiennymi `EPITO_SMTP_USER` / `EPITO_SMTP_HOST` (patrz `docker-compose.local.yml`) — dokładny host i port znajdziesz w panelu OVH, w konfiguracji klienta pocztowego dla tej skrzynki.

Nie kopiuj plików z hasłami do repozytorium ani obrazu Docker. Produkcyjny stack domyślnie odczytuje odpowiedniki z `/opt/epito/secrets` na serwerze.
