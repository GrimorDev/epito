# Wdrożenie Epito w Portainerze

Repozytorium publikuje gotowy obraz dla `linux/amd64` i `linux/arm64` pod adresem:

```text
ghcr.io/grimordev/epito:latest
```

## 1. Dostęp Portainera do prywatnego obrazu

Repozytorium i pierwszy obraz GHCR są prywatne. W GitHub utwórz token klasyczny z uprawnieniem `read:packages`, a następnie w Portainerze przejdź do `Registries`, wybierz `Custom registry` i podaj:

```text
Registry URL: ghcr.io
Username: GrimorDev
Password: token GitHub z read:packages
```

Nie wpisuj tokenu bezpośrednio do pliku Compose.

## 2. Utworzenie stacka

W Portainerze otwórz `Stacks`, wybierz `Add stack`, nadaj nazwę `epito` i użyj pliku `docker-compose.yml` z repozytorium. Możesz wkleić jego zawartość w edytorze albo wskazać repozytorium Git.

Dla prywatnego repozytorium Git podaj adres:

```text
https://github.com/GrimorDev/epito.git
```

oraz poświadczenia GitHub mające dostęp tylko do odczytu tego repozytorium.

## 3. Zmienne stacka

Domyślne wartości wystarczą do startu. W sekcji `Environment variables` możesz ustawić:

| Zmienna | Domyślna wartość | Znaczenie |
| --- | --- | --- |
| `EPITO_IMAGE` | `ghcr.io/grimordev/epito:latest` | Obraz wdrożenia |
| `EPITO_CONTAINER_NAME` | `epito` | Nazwa kontenera |
| `EPITO_BIND_ADDRESS` | `0.0.0.0` | Adres, na którym publikowany jest port |
| `EPITO_PORT` | `3000` | Port serwera dostępny z hosta |
| `EPITO_NETWORK` | `epito` | Nazwa sieci Docker |

Po wdrożeniu aplikacja jest dostępna pod adresem `http://ADRES_SERWERA:3000`. Endpoint monitorujący stan aplikacji to `/api/health`.

## 4. Domena i HTTPS

W produkcji skieruj domenę do reverse proxy, na przykład Traefik, Nginx Proxy Manager albo Caddy. Proxy powinno przekazywać ruch do `http://epito:3000` i ustawiać nagłówki `Host`, `X-Forwarded-Host` oraz `X-Forwarded-Proto`. Dzięki temu Epito generuje poprawne adresy kanoniczne i dane Schema.org dla właściwej domeny.

Jeśli reverse proxy działa w Dockerze, dołącz je do sieci ustawionej w `EPITO_NETWORK`. Jeśli działa na hoście, może korzystać z opublikowanego portu `EPITO_PORT`.

## 5. Aktualizacje

Każdy push do gałęzi `main` uruchamia GitHub Actions, buduje obraz i publikuje tag `latest`. W Portainerze wybierz `Pull latest image and redeploy`, aby pobrać nową wersję.

## Build bez GHCR

Do budowania obrazu bezpośrednio z checkoutu repozytorium służy alternatywny plik:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

Ten wariant jest przeznaczony głównie do testów i serwerów, na których Portainer klonuje repozytorium przed wykonaniem buildu.

## Ważne przed uruchomieniem produkcyjnym

Obecna wersja jest interaktywnym prototypem frontendu. Nie przechowuje jeszcze danych klientów, nie ma docelowego logowania B2B, bazy danych, kopii zapasowych ani integracji płatniczych. Kontener jest stateless i dlatego nie montuje wolumenów. Te elementy trzeba wdrożyć przed obsługą prawdziwych danych księgowych.
