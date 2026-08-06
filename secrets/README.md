# Sekrety lokalne

Pliki z tego katalogu nie są śledzone przez Git. Do lokalnego uruchomienia utwórz cztery pliki zawierające wyłącznie silne, niezależne hasła:

```text
secrets/postgres_admin_password
secrets/db_password
secrets/redis_password
secrets/supervisor_password
```

Nie kopiuj plików z hasłami do repozytorium ani obrazu Docker. Produkcyjny stack domyślnie odczytuje odpowiedniki z `/opt/epito/secrets` na serwerze.
