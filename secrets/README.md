# Sekrety lokalne

Pliki z tego katalogu nie są śledzone przez Git. Do lokalnego uruchomienia utwórz pięć plików zawierających wyłącznie silne, niezależne hasła:

```text
secrets/postgres_admin_password
secrets/db_password
secrets/redis_password
secrets/supervisor_password
secrets/ksef_encryption_key
```

`ksef_encryption_key` musi zawierać 32 losowe bajty zakodowane w base64 (klucz AES-256-GCM do szyfrowania tokenów KSeF w bazie). Wygeneruj go poleceniem:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Klucz API [Resend](https://resend.com) (do wysyłki automatycznych przypomnień o płatnościach) **nie jest plikiem sekretu** — to zwykła zmienna środowiskowa `EPITO_RESEND_API_KEY`, opcjonalna i bezpiecznie pusta domyślnie (bez niej przypomnienia po prostu się nie wysyłają, worker to zaloguje i działa dalej). Wymaga też zweryfikowanej domeny nadawcy w Resend (rekordy SPF/DKIM w DNS) i ustawienia `EPITO_RESEND_FROM_EMAIL`.

Nie kopiuj plików z hasłami do repozytorium ani obrazu Docker. Produkcyjny stack domyślnie odczytuje odpowiedniki z `/opt/epito/secrets` na serwerze.
