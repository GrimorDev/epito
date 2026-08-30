# Roadmapa integracji Epito

Stan na 11 sierpnia 2026 r. Dokument rozróżnia funkcje działające od planowanych, aby komunikacja produktu nie sugerowała nieistniejących integracji.

## Działa obecnie

- KSeF: połączenie tenantowe, synchronizacja przychodzących faktur, wystawianie FA(3), kolejka wysyłki, statusy, ponowienie i lokalne anulowanie odrzuconej próby.
- JPK_FA: import plików XML eksportowanych między innymi z Comarch, InsERT i Symfonii. To import standardowego pliku, a nie bezpośrednie API tych programów.
- Dokumenty: PDF, obrazy i XML, odczyt tekstu lub OCR, ręczna korekta i rejestr audytowy.
- Płatności: zwykły przelew na rachunek wskazany przez biuro. Każda płatność dostaje unikalną referencję `EP-…`, a panel klienta dopisuje ją do pełnego tytułu przelewu. Epito nie przyjmuje środków i nie przechowuje danych logowania do banku.
- Rozliczanie przelewów: import MT940, CAMT.053 lub CSV automatycznie porównuje referencję, kwotę, walutę i kierunek przepływu. Dopiero pełna zgodność ustawia status `paid`; częściowe, niezgodne i nierozpoznane transakcje trafiają do ręcznej weryfikacji. Powtórny import pliku lub tej samej transakcji nie rozlicza płatności drugi raz.

## Etap 1: integracje publiczne i bez opłat transakcyjnych

1. Biała Lista VAT Ministerstwa Finansów: weryfikacja NIP, statusu VAT i rachunku na dzień transakcji, z zachowaniem klucza potwierdzającego zapytanie.
2. REGON BIR1: uzupełnianie danych firmy po NIP lub REGON. Usługa GUS jest bezpłatna, ale wymaga klucza produkcyjnego.
3. VIES: walidacja numerów VAT UE przez oficjalny interfejs Komisji Europejskiej.
4. Profile CSV dla najczęściej używanych banków, jeśli ich nazwy kolumn odbiegają od obsługiwanego formatu ogólnego.
5. Kod QR z danymi zwykłego przelewu, zgodny ze specyfikacją obsługiwaną przez aplikacje bankowe.

## Etap 2: wymiana z programami księgowymi

- profile importu i eksportu dla Comarch Optima, InsERT Rewizor i Symfonia;
- JPK_KR_PD i JPK_ST_KR po ustabilizowaniu wymagań oraz scenariuszy klientów pilotażowych;
- skrzynka dokumentowa e-mail z bezpiecznym przypisaniem załączników do organizacji;
- eksport dekretów i statusów bez bezpośredniego zapisu do bazy programu księgowego.

## Etap 3: płatności online

- jeden operator płatności wybrany po pilotażu, z BLIK i szybkim przelewem;
- każda organizacja łączy własne konto akceptanta, a środki trafiają bezpośrednio do właściwego odbiorcy;
- Epito używa strony płatności hostowanej przez operatora i nie przechowuje kodów BLIK, danych karty ani loginów bankowych;
- status `paid` powstaje wyłącznie po potwierdzonym zdarzeniu operatora albo po uzgodnieniu wyciągu bankowego, nigdy po samym powrocie klienta do aplikacji;
- odbiornik webhooka czyta niezmienione surowe body, weryfikuje mechanizm właściwy dla wybranego operatora, chroni przed ponowieniem i zapisuje zdarzenie idempotentnie;
- przed zmianą statusu musi zgadzać się identyfikator zamówienia lub sesji, kwota, waluta i dozwolone przejście statusu;
- dla Przelewy24 po powiadomieniu wymagane jest dodatkowe serwerowe `transaction/verify`; dla Tpay wymagana jest weryfikacja JWS oraz łańcucha certyfikatu zgodnie z dokumentacją operatora;
- błędny podpis, powtórzone zdarzenie i niezgodne dane są odrzucane i zapisywane w audycie bezpieczeństwa.

Pakiet bez abonamentu nie oznacza płatności całkowicie darmowych. Operator może pobierać opłatę aktywacyjną i prowizję od transakcji. Dlatego bezpłatnym wariantem bazowym pozostaje zwykły przelew oraz import wyciągu, a BLIK i karta są dodatkiem po wyborze jednego PSP.

Bezpośrednia integracja z mBankiem nie jest planowana w pierwszych etapach. Import standardowych wyciągów daje pokrycie wielu banków przy znacznie mniejszym koszcie wdrożenia i utrzymania.

## Źródła decyzji

- [API Wykazu podatników VAT](https://www.gov.pl/web/kas/api-wykazu-podatnikow-vat)
- [API REGON GUS](https://api.stat.gov.pl/home/regonapi)
- [VIES, informacje techniczne](https://ec.europa.eu/taxation_customs/vies/technicalInformation.html)
- [BLIK dla firm](https://www.blik.com/rozwiazania-dla-biznesu)
- [Dokumentacja Przelewy24](https://developers.przelewy24.pl/)
- [Dokumentacja webhooków Tpay](https://docs-api.tpay.com/en/webhooks/)
- [Oferta Przelewy24](https://www.przelewy24.pl/lp/oferta-dla-nowych-klientow)
- [Oferta Tpay](https://tpay.com/oferta)
