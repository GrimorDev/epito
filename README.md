# Epito

Epito to responsywny portal klienta z produkcyjnym logowaniem B2B, panelem organizacji, panelem supervisora oraz warstwą PostgreSQL i Redis dla wdrożeń Docker.

## Widoki

- `/` — landing page produktu
- `/panel` — publiczna demonstracja panelu klienta
- `/workspace` — produkcyjny panel klienta, zgodny wizualnie z demo
- `/office` — zaplecze organizacji do zarządzania firmami, płatnościami i zespołem
- `/admin` — panel właściciela platformy
- `/api/health` — stan usługi dla Dockera i monitoringu

## Uruchomienie lokalne

Wymagany jest Node.js `22.13` lub nowszy.

```bash
npm ci
npm run dev
```

Build używany przez obecne wdrożenie demonstracyjne:

```bash
npm run build
```

Build produkcyjny Next.js dla Dockera:

```bash
npm run build:docker
npm run start:next
```

## Docker

Lokalny build i start:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Start stacka produkcyjnego z lokalnym buildem:

```bash
docker compose up -d --build
```

Szczegółowa konfiguracja Portainera, prywatnego GHCR, domeny i aktualizacji znajduje się w [PORTAINER.md](PORTAINER.md).

Stack uruchamia aplikację, PostgreSQL 16, Redis 7 oraz jednorazowy migrator. Bazy nie publikują portów na hoście. PostgreSQL wykorzystuje osobne konto administracyjne i ograniczoną rolę aplikacyjną z wymuszonym RLS, Redis ma AOF i uwierzytelnianie, a dokumenty są zapisywane w trwałym wolumenie `uploads_data`.

## Automatyczne obrazy

Workflow `.github/workflows/docker-publish.yml` buduje obrazy `linux/amd64` i `linux/arm64` po każdym pushu do `main` oraz dla tagów `v*`.

```text
ghcr.io/grimordev/epito:latest
```

## Status produktu

Logowanie B2B, organizacje, zespół, płatności, ustawienia i magazyn dokumentów zapisują dane produkcyjne. Publiczne demo pozostaje odseparowane od PostgreSQL. Integracja operatora płatności, produkcyjny moduł wiadomości, automatyczne backupy i komplet dokumentacji RODO wymagają dalszej konfiguracji przed komercyjnym uruchomieniem.
