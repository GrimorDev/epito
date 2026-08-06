# Wdrożenie Epito w Portainerze

Domyślny stack buduje aplikację bezpośrednio z repozytorium. Nie pobiera prywatnego obrazu `ghcr.io/grimordev/epito:latest`, dlatego nie występuje błąd `denied` podczas odczytu manifestu GHCR.

Stack uruchamia:

- `epito` — aplikację Next.js z logowaniem B2B,
- `postgres` — PostgreSQL 16 z trwałym wolumenem i RLS,
- `redis` — Redis 7 z AOF dla sesji, rate limitingu i kolejek,
- `migrate` — migracje oraz bezpieczne utworzenie konta supervisora.

PostgreSQL i Redis nie publikują portów na hoście. Są dostępne tylko w izolowanej sieci `backend-internal`.

## 1. Przygotuj cztery sekrety

Na serwerze Docker utwórz trzy losowe hasła techniczne oraz osobny plik z wybranym hasłem supervisora:

```bash
sudo install -d -m 700 /opt/epito/secrets
umask 077
openssl rand -base64 48 | sudo tee /opt/epito/secrets/postgres_admin_password >/dev/null
openssl rand -base64 48 | sudo tee /opt/epito/secrets/db_password >/dev/null
openssl rand -base64 48 | sudo tee /opt/epito/secrets/redis_password >/dev/null
sudo sh -c 'read -rsp "Hasło supervisora: " value; printf "%s" "$value" > /opt/epito/secrets/supervisor_password; echo'
sudo chmod 600 /opt/epito/secrets/*
```

Hasła nie trafiają do Compose, repozytorium ani zmiennych środowiskowych. `supervisor_password` powinien mieć co najmniej 12 znaków, literę i cyfrę.

## 2. Dodaj stack z prywatnego repozytorium

W Portainerze wybierz:

1. `Stacks` → `Add stack`.
2. Metodę `Repository`, nie `Web editor`.
3. Adres `https://github.com/GrimorDev/epito.git`.
4. Uwierzytelnienie GitHub do odczytu prywatnego repozytorium.
5. Gałąź `refs/heads/main`.
6. Compose path `docker-compose.yml`.

Portainer musi klonować repozytorium, ponieważ kontekst `build: .` zawiera kod aplikacji i Dockerfile.

## 3. Ustaw zmienne stacka

W sekcji `Environment variables` ustaw co najmniej:

| Zmienna | Wartość |
| --- | --- |
| `EPITO_SUPERVISOR_EMAIL` | adres e-mail właściciela platformy |
| `EPITO_BASE_DOMAIN` | produkcyjna domena bazowa, na przykład `epito.pl` |
| `EPITO_PORT` | port hosta, domyślnie `3000` |

Pozostałe wartości mają bezpieczne ustawienia domyślne:

| Zmienna | Domyślna wartość |
| --- | --- |
| `EPITO_IMAGE` | `epito:server` |
| `EPITO_PULL_POLICY` | `build` |
| `EPITO_DATABASE_NAME` | `epito_prod` |
| `EPITO_NETWORK` | `epito` |
| `EPITO_BACKEND_NETWORK` | `epito-backend-internal` |
| `EPITO_POSTGRES_ADMIN_PASSWORD_FILE` | `/opt/epito/secrets/postgres_admin_password` |
| `EPITO_DB_PASSWORD_FILE` | `/opt/epito/secrets/db_password` |
| `EPITO_REDIS_PASSWORD_FILE` | `/opt/epito/secrets/redis_password` |
| `EPITO_SUPERVISOR_PASSWORD_FILE` | `/opt/epito/secrets/supervisor_password` |

Nie ustawiaj `EPITO_IMAGE` na adres GHCR, dopóki rejestr i uprawnienie `read:packages` nie są poprawnie skonfigurowane.

## 4. Uruchom i sprawdź

Kliknij `Deploy the stack`. Pierwszy build może potrwać kilka minut. Kolejność startu jest kontrolowana przez healthchecki:

1. PostgreSQL inicjalizuje bazę z SCRAM-SHA-256 i checksumami stron.
2. Migrator tworzy schemat, ograniczoną rolę `epito_app`, RLS i konto supervisora.
3. Redis przechodzi healthcheck.
4. Epito uruchamia aplikację.

Sprawdź:

```text
https://twoja-domena.pl/api/health
https://twoja-domena.pl/logowanie
```

Logowanie supervisora używa e-maila ze zmiennej `EPITO_SUPERVISOR_EMAIL` i hasła z pliku `supervisor_password`. Po zalogowaniu można tworzyć rzeczywiste organizacje oraz pierwsze konta ich właścicieli. Właściciel organizacji może następnie tworzyć klientów i pracowników.

Publiczne `/panel` oraz `/admin` pozostają demonstracją i nie zapisują przykładowych danych do PostgreSQL. Produkcyjne dane są dostępne tylko po logowaniu pod `/workspace` i `/supervisor`.

## 5. Domena i adresy organizacji

Reverse proxy, na przykład Traefik, Nginx Proxy Manager lub Caddy, powinno przekazywać ruch do `http://epito:3000` i ustawiać nagłówki `Host`, `X-Forwarded-Host` oraz `X-Forwarded-Proto`.

Dla adresów w formacie `klient.epito.pl` dodaj certyfikat wildcard `*.epito.pl` oraz wildcard DNS kierujący na serwer. `EPITO_BASE_DOMAIN` służy do prezentowania właściwych adresów w panelu supervisora.

## 6. RLS i wielofirmowość

Operacje organizacji działają w transakcji ustawiającej `app.current_tenant_id` i `app.current_user_id`. Polityki PostgreSQL blokują odczyt oraz zapis między organizacjami. Rola `epito_app` nie jest superużytkownikiem, właścicielem tabel ani rolą `BYPASSRLS`. Kontrolowane operacje supervisora są audytowane.

## 7. Kopie zapasowe

Przykładowy backup PostgreSQL:

```bash
docker exec epito-postgres sh -c 'PGPASSWORD="$(cat /run/secrets/postgres_admin_password)" pg_dump -U epito_admin -d epito_prod -Fc' > epito-$(date +%F-%H%M).dump
```

Przechowuj kopie poza VPS-em i regularnie testuj odtwarzanie. Wolumen nie jest kopią zapasową.

## 8. Aktualizacja

W stacku opartym na repozytorium użyj `Pull and redeploy`. Portainer pobierze nowy commit i przebuduje obraz lokalnie. Migrator pomija zastosowane migracje i zatrzymuje wdrożenie, jeżeli historyczny plik migracji został zmieniony.

## Lokalny build

Utwórz cztery pliki w `secrets/`, ustaw `EPITO_SUPERVISOR_EMAIL` i uruchom:

```bash
docker compose -f docker-compose.local.yml up -d --build
```
