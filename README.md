# Epito

Epito to responsywny prototyp portalu klienta dla biur rachunkowych. Zawiera landing page, panel klienta oraz panel właściciela platformy.

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
npm run start:docker
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

## Automatyczne obrazy

Workflow `.github/workflows/docker-publish.yml` buduje obrazy `linux/amd64` i `linux/arm64` po każdym pushu do `main` oraz dla tagów `v*`.

```text
ghcr.io/grimordev/epito:latest
```

## Status produktu

To wersja demonstracyjna interfejsu. Nie należy jeszcze używać jej do przechowywania prawdziwych danych księgowych. Docelowe logowanie B2B, baza danych, trwałe przechowywanie dokumentów, płatności, kopie zapasowe i polityki RODO wymagają implementacji backendu.
