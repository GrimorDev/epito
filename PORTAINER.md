# Wdrożenie Epito w Portainerze

Stack uruchamia cztery usługi:

- `epito` — aplikacja Next.js,
- `postgres` — PostgreSQL 16 z trwałym wolumenem,
- `redis` — Redis 7 z AOF i trwałym wolumenem,
- `migrate` — jednorazowa migracja schematu i ograniczonej roli `epito_app`.

PostgreSQL i Redis działają wyłącznie w izolowanej sieci `backend-internal`. Nie mają opublikowanych portów na hoście.

## 1. Przygotowanie sekretów na serwerze

Na serwerze z Dockerem utwórz katalog dostępny dla Portainera i trzy niezależne hasła:

```bash
sudo install -d -m 700 /opt/epito/secrets
umask 077
openssl rand -base64 48 | sudo tee /opt/epito/secrets/postgres_admin_password >/dev/null
openssl rand -base64 48 | sudo tee /opt/epito/secrets/db_password >/dev/null
openssl rand -base64 48 | sudo tee /opt/epito/secrets/redis_password >/dev/null
sudo chmod 600 /opt/epito/secrets/*
```

- `postgres_admin_password` służy wyłącznie migracjom i administracji bazą.
- `db_password` należy do ograniczonej roli aplikacyjnej `epito_app`.
- `redis_password` chroni sesje, OTP, rate limiting i kolejki.

Nie wpisuj haseł do Compose, repozytorium ani zmiennych środowiskowych aplikacji. Kontenery odczytują je z plików zamontowanych jako sekrety.

## 2. Dostęp Portainera do repozytorium i GHCR

Repozytorium oraz obraz są prywatne. W Portainerze dodaj rejestr `ghcr.io` z użytkownikiem `GrimorDev` i tokenem GitHub mającym `read:packages`.

Repozytorium stacka:

```text
https://github.com/GrimorDev/epito.git
```

Do klonowania prywatnego repozytorium użyj poświadczeń GitHub tylko do odczytu.

## 3. Utworzenie stacka

W Portainerze wybierz `Stacks`, następnie `Add stack`, metodę `Repository` oraz plik `docker-compose.yml`. Domyślne ścieżki sekretów wskazują na `/opt/epito/secrets`.

Najważniejsze opcjonalne zmienne:

| Zmienna | Domyślna wartość | Znaczenie |
| --- | --- | --- |
| `EPITO_IMAGE` | `ghcr.io/grimordev/epito:latest` | Obraz aplikacji i migratora |
| `EPITO_PORT` | `3000` | Port aplikacji na hoście |
| `EPITO_DATABASE_NAME` | `epito_prod` | Nazwa bazy PostgreSQL |
| `EPITO_NETWORK` | `epito` | Sieć aplikacji i reverse proxy |
| `EPITO_BACKEND_NETWORK` | `epito-backend-internal` | Izolowana sieć baz |
| `EPITO_POSTGRES_ADMIN_PASSWORD_FILE` | `/opt/epito/secrets/postgres_admin_password` | Plik hasła administratora |
| `EPITO_DB_PASSWORD_FILE` | `/opt/epito/secrets/db_password` | Plik hasła aplikacji |
| `EPITO_REDIS_PASSWORD_FILE` | `/opt/epito/secrets/redis_password` | Plik hasła Redis |

Przy pierwszym wdrożeniu PostgreSQL inicjalizuje klaster z SCRAM-SHA-256 i checksumami stron. Następnie `migrate` tworzy schemat, rolę `epito_app`, klucze obce, indeksy JSONB oraz polityki RLS. Aplikacja startuje dopiero po poprawnym zakończeniu migracji i przejściu healthchecków PostgreSQL oraz Redis.

Endpoint `GET /api/health` zwraca stan aplikacji i obu zależności. Nie ujawnia adresów, haseł ani komunikatów błędów bazy.

## 4. RLS i wielofirmowość

Każda operacja na danych firmy musi być wykonana przez helper `withTenantTransaction`. Ustawia on lokalnie dla transakcji:

```text
app.current_tenant_id
app.current_user_id
```

Polityki PostgreSQL filtrują dane po `tenant_id`. Rola `epito_app` nie jest właścicielem tabel, superużytkownikiem ani rolą `BYPASSRLS`. Panel właściciela platformy powinien korzystać z kontrolowanych operacji serwerowych i rejestrować działania w `audit_log`, a nie wyłączać RLS.

## 5. Redis

Redis ma włączone:

- `appendonly yes`,
- `appendfsync everysec`,
- politykę `noeviction`, która nie usuwa samoczynnie sesji ani zadań,
- uwierzytelnianie hasłem z sekretu,
- trwały wolumen `epito-redis-data`.

Kod aplikacji zawiera rate limiting, OTP z TTL, unieważnianie sesji oraz kolejki BullMQ dla powiadomień, dokumentów i integracji.

## 6. Domena i HTTPS

Reverse proxy, na przykład Traefik, Nginx Proxy Manager albo Caddy, powinno przekazywać ruch do `http://epito:3000` i ustawiać `Host`, `X-Forwarded-Host` oraz `X-Forwarded-Proto`. Dołącz proxy do sieci określonej przez `EPITO_NETWORK`.

## 7. Kopie zapasowe PostgreSQL

Przykładowy ręczny backup w formacie kompresowanym:

```bash
docker exec epito-postgres sh -c 'PGPASSWORD="$(cat /run/secrets/postgres_admin_password)" pg_dump -U epito_admin -d epito_prod -Fc' > epito-$(date +%F-%H%M).dump
```

Backupy przechowuj poza VPS-em i regularnie testuj ich odtwarzanie. Wolumen nie jest kopią zapasową.

## 8. Aktualizacje

Każdy push do `main` publikuje nowy obraz `latest`. W Portainerze wybierz `Pull latest image and redeploy`. Migrator jest idempotentny: pomija wykonane migracje i zatrzymuje wdrożenie, jeśli wcześniej zastosowany plik SQL został zmieniony.

## Build bez GHCR

Do lokalnego buildu służy:

```bash
mkdir -p secrets
openssl rand -base64 48 > secrets/postgres_admin_password
openssl rand -base64 48 > secrets/db_password
openssl rand -base64 48 > secrets/redis_password
docker compose -f docker-compose.local.yml up -d --build
```

## Aktualny zakres produktu

Infrastruktura PostgreSQL, Redis, migracje, RLS i bezpieczne połączenia są przygotowane. Widoki demonstracyjne nadal korzystają z przykładowych danych w interfejsie. Przed obsługą prawdziwych klientów trzeba podłączyć formularze i operacje panelu do API, wdrożyć logowanie B2B oraz obiektowy magazyn plików z szyfrowaniem i polityką retencji.
