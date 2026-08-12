# Wdrożenie Epito w Portainerze

Domyślny stack jest przygotowany dla Docker Standalone i można go skonfigurować w całości z panelu Portainera. Nie wymaga tworzenia plików przez SSH i nie pobiera prywatnego obrazu `ghcr.io/grimordev/epito:latest`.

Stack uruchamia:

- `epito` — aplikację Next.js z logowaniem B2B,
- `postgres` — PostgreSQL 16 z trwałym wolumenem i RLS,
- `redis` — Redis 7 z AOF dla sesji, rate limitingu i kolejek,
- `document-worker` — odczyt tekstu PDF i lokalny OCR faktur wykonywany poza procesem aplikacji,
- `ksef-worker` — synchronizacja faktur klientów z Krajowym Systemem e-Faktur (KSeF),
- `migrate` — migracje oraz bezpieczne utworzenie konta supervisora.

PostgreSQL i Redis nie publikują portów na hoście. Są dostępne tylko w izolowanej sieci `backend-internal`.

## 1. Dodaj stack z prywatnego repozytorium

W Portainerze wybierz:

1. `Stacks` → `Add stack`.
2. Metodę `Repository`.
3. Adres `https://github.com/GrimorDev/epito.git`.
4. Uwierzytelnienie GitHub do odczytu prywatnego repozytorium.
5. Gałąź `refs/heads/main`.
6. Compose path `docker-compose.yml`.

Portainer klonuje repozytorium, a następnie buduje aplikację z Dockerfile. Ten wariant jest przeznaczony dla lokalnego środowiska Docker Standalone, na przykład Portainera podłączonego do `/var/run/docker.sock` na tym samym serwerze. Portainer nie obsługuje kroków `build:` dla zdalnych środowisk Docker. W takim układzie trzeba użyć zewnętrznie zbudowanego obrazu i skonfigurować rejestr GHCR z tokenem `read:packages`.

## 2. Dodaj zmienne w Portainerze

W sekcji `Environment variables` dodaj wszystkie poniższe pozycje:

| Zmienna | Wartość |
| --- | --- |
| `EPITO_SUPERVISOR_EMAIL` | adres e-mail właściciela platformy |
| `EPITO_SUPERVISOR_PASSWORD` | wybrane silne hasło supervisora |
| `EPITO_POSTGRES_ADMIN_PASSWORD` | unikalne losowe hasło techniczne, minimum 32 znaki |
| `EPITO_DB_PASSWORD` | inne unikalne losowe hasło techniczne, minimum 32 znaki |
| `EPITO_REDIS_PASSWORD` | kolejne unikalne losowe hasło techniczne, minimum 32 znaki |
| `EPITO_KSEF_ENCRYPTION_KEY` | 32 losowe bajty zakodowane w base64 (klucz AES-256-GCM do szyfrowania tokenów KSeF) — wygeneruj `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"` |
| `EPITO_RESEND_API_KEY` | klucz API z konta [Resend](https://resend.com), do wysyłki automatycznych przypomnień o płatnościach — opcjonalny, można w ogóle nie dodawać tej zmiennej w Portainerze (przypomnienia po prostu się nie wyślą, worker to zaloguje) |
| `EPITO_RESEND_FROM_EMAIL` | adres nadawcy przypomnień, np. `biuro@epito.pl` — wymaga zweryfikowanej domeny (SPF/DKIM) w panelu Resend |
| `EPITO_RESEND_REPLY_TO` | adres, na który trafiają odpowiedzi klientów na przypomnienia, np. `support@epito.pl` — opcjonalny, zostaw puste żeby wyłączyć |
| `EPITO_BASE_DOMAIN` | produkcyjna domena bazowa, na przykład `epito.pl` |
| `EPITO_PORT` | port hosta, domyślnie `8063` |
| `EPITO_UPLOADS_VOLUME` | opcjonalna nazwa trwałego wolumenu dokumentów, domyślnie `epito-uploads-data` |

Cztery hasła/klucze techniczne muszą być różne. Wygeneruj je w menedżerze haseł. Nie umieszczaj ich w repozytorium ani w pliku `.env` przesyłanym do Git.

Compose pobiera pięć wartości z konfiguracji Portainera (cztery hasła i klucz szyfrowania KSeF) i udostępnia je kontenerom jako pliki w `/run/secrets`. Nie trafiają do zmiennych środowiskowych uruchomionych usług i nie pojawiają się w `docker inspect` kontenerów. Pozostają jednak dostępne administratorom Portainera, dlatego dostęp do stacka powinien być ograniczony do administratorów.

Pozostałe ustawienia mają bezpieczne wartości domyślne:

| Zmienna | Domyślna wartość |
| --- | --- |
| `EPITO_IMAGE` | `epito:server` |
| `EPITO_WORKER_IMAGE` | `epito-document-worker:server` |
| `EPITO_KSEF_WORKER_IMAGE` | `epito-ksef-worker:server` |
| `EPITO_KSEF_POLL_INTERVAL_MS` | `600000` (10 minut) — jak często automatycznie synchronizowane jest każde połączenie KSeF w tle |
| `EPITO_PULL_POLICY` | `build` |
| `EPITO_DATABASE_NAME` | `epito_prod` |
| `EPITO_NETWORK` | `epito` |
| `EPITO_BACKEND_NETWORK` | `epito-backend-internal` |

Nie ustawiaj `EPITO_IMAGE` na adres GHCR, dopóki rejestr i uprawnienie `read:packages` nie są poprawnie skonfigurowane.

## 3. Uruchom i sprawdź

Kliknij `Deploy the stack`. Pierwszy build może potrwać kilka minut. Kolejność startu jest kontrolowana przez healthchecki:

1. PostgreSQL inicjalizuje bazę z SCRAM-SHA-256 i checksumami stron.
2. Migrator tworzy schemat, ograniczoną rolę `epito_app`, RLS i konto supervisora.
3. Redis przechodzi healthcheck.
4. Epito uruchamia aplikację, a `document-worker` i `ksef-worker` zaczynają odbierać zadania z Redisa.

Sprawdź:

```text
https://twoja-domena.pl/api/health
https://twoja-domena.pl/logowanie
```

Logowanie supervisora używa wartości `EPITO_SUPERVISOR_EMAIL` i `EPITO_SUPERVISOR_PASSWORD`. Po zalogowaniu można tworzyć rzeczywiste organizacje oraz pierwsze konta ich właścicieli. Właściciel widzi produkcyjny portal pod `/workspace`, zgodny z publicznym demo, a zarządzanie firmami, płatnościami i pracownikami znajduje się pod `/office`.

Publiczne demo działa wyłącznie pod `/panel` i nie zapisuje przykładowych danych do PostgreSQL. Produkcyjne dane są dostępne po logowaniu pod `/workspace`, a prawdziwy panel właściciela platformy pod `/admin`.

## 4. Domena i adresy organizacji

Reverse proxy, na przykład Traefik, Nginx Proxy Manager lub Caddy, powinno przekazywać ruch do `http://epito:3000` i ustawiać nagłówki `Host`, `X-Forwarded-Host` oraz `X-Forwarded-Proto`.

Dla adresów w formacie `klient.epito.pl` dodaj certyfikat wildcard `*.epito.pl` oraz wildcard DNS kierujący na serwer. `EPITO_BASE_DOMAIN` służy do prezentowania właściwych adresów w panelu supervisora.

## 5. RLS i wielofirmowość

Operacje organizacji działają w transakcji ustawiającej `app.current_tenant_id` i `app.current_user_id`. Polityki PostgreSQL blokują odczyt oraz zapis między organizacjami. Rola `epito_app` nie jest superużytkownikiem, właścicielem tabel ani rolą `BYPASSRLS`. Kontrolowane operacje supervisora są audytowane.

## 6. Kopie zapasowe

Przykładowy backup PostgreSQL:

```bash
docker exec epito-postgres sh -c 'PGPASSWORD="$(cat /run/secrets/postgres_admin_password)" pg_dump -U epito_admin -d epito_prod -Fc' > epito-$(date +%F-%H%M).dump
```

Przechowuj kopie poza VPS-em i regularnie testuj odtwarzanie. Oprócz PostgreSQL wykonuj kopię wolumenu `epito-uploads-data`, ponieważ zawiera przesłane dokumenty. Wolumen nie jest kopią zapasową.

## 7. Aktualizacja

W stacku opartym na repozytorium użyj `Pull and redeploy`. Portainer pobierze nowy commit i przebuduje obraz aplikacji oraz osobny obraz workera lokalnie. Migrator pomija zastosowane migracje i zatrzymuje wdrożenie, jeżeli historyczny plik migracji został zmieniony.

## Lokalny build poza Portainerem

Lokalny plik `docker-compose.local.yml` nadal używa plików z katalogu `secrets/`. Ustaw `EPITO_SUPERVISOR_EMAIL`, utwórz pięć plików zgodnie z `secrets/README.md` i uruchom:

```bash
docker compose -f docker-compose.local.yml up -d --build
```
