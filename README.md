# Epito

Epito to responsywny prototyp portalu klienta dla biur rachunkowych. Zawiera landing page, panel klienta, panel właściciela platformy oraz produkcyjną podstawę PostgreSQL i Redis dla wdrożeń Docker.

## Widoki

- `/` — landing page produktu
- `/panel` — panel klienta biura rachunkowego
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

Start z gotowego obrazu GHCR:

```bash
docker compose up -d
```

Szczegółowa konfiguracja Portainera, prywatnego GHCR, domeny i aktualizacji znajduje się w [PORTAINER.md](PORTAINER.md).

Stack uruchamia aplikację, PostgreSQL 16, Redis 7 oraz jednorazowy migrator. Bazy nie publikują portów na hoście. PostgreSQL wykorzystuje osobne konto administracyjne i ograniczoną rolę aplikacyjną z wymuszonym RLS, a Redis ma AOF, uwierzytelnianie i trwały wolumen.

Przed pierwszym uruchomieniem trzeba utworzyć trzy pliki sekretów opisane w `PORTAINER.md`.

## Automatyczne obrazy

Workflow `.github/workflows/docker-publish.yml` buduje obrazy `linux/amd64` i `linux/arm64` po każdym pushu do `main` oraz dla tagów `v*`.

```text
ghcr.io/grimordev/epito:latest
```

## Status produktu

To nadal wersja demonstracyjna interfejsu. Schemat PostgreSQL, RLS, Redis, migracje i mechanizmy bezpieczeństwa są gotowe jako warstwa backendowa, ale formularze panelu nie zapisują jeszcze danych. Docelowe logowanie B2B, magazyn plików, integracje płatnicze, automatyczne backupy i pełne polityki RODO wymagają dalszej implementacji.
