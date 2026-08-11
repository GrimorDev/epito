# Roadmapa integracji Epito

Stan na 11 sierpnia 2026 r. Dokument rozróżnia funkcje działające od planowanych, aby komunikacja produktu nie sugerowała nieistniejących integracji.

## Działa obecnie

- KSeF: połączenie tenantowe, synchronizacja przychodzących faktur, wystawianie FA(3), kolejka wysyłki, statusy, ponowienie i lokalne anulowanie odrzuconej próby.
- JPK_FA: import plików XML eksportowanych między innymi z Comarch, InsERT i Symfonii. To import standardowego pliku, a nie bezpośrednie API tych programów.
- Dokumenty: PDF, obrazy i XML, odczyt tekstu lub OCR, ręczna korekta i rejestr audytowy.
- Płatności: zwykły przelew na rachunek wskazany przez biuro. Klient kopiuje odbiorcę, rachunek, kwotę i tytuł. Epito nie przyjmuje środków i nie oznacza płatności jako opłaconej bez potwierdzenia.

## Etap 1: integracje publiczne i bez opłat transakcyjnych

1. Biała Lista VAT Ministerstwa Finansów: weryfikacja NIP, statusu VAT i rachunku na dzień transakcji, z zachowaniem klucza potwierdzającego zapytanie.
2. REGON BIR1: uzupełnianie danych firmy po NIP lub REGON. Usługa GUS jest bezpłatna, ale wymaga klucza produkcyjnego.
3. VIES: walidacja numerów VAT UE przez oficjalny interfejs Komisji Europejskiej.
4. Import wyciągów MT940, CAMT.053 oraz CSV: automatyczne kojarzenie przelewu z płatnością po rachunku, kwocie i tytule. To zastępuje na pierwszym etapie kosztowną integrację z pojedynczym bankiem.
5. Bezpieczne dane do przelewu: walidacja rachunku, czytelny tytuł, kopiowanie i później kod QR zgodny ze specyfikacją obsługiwaną przez aplikacje bankowe.

## Etap 2: wymiana z programami księgowymi

- profile importu i eksportu dla Comarch Optima, InsERT Rewizor i Symfonia;
- JPK_KR_PD i JPK_ST_KR po ustabilizowaniu wymagań oraz scenariuszy klientów pilotażowych;
- skrzynka dokumentowa e-mail z bezpiecznym przypisaniem załączników do organizacji;
- eksport dekretów i statusów bez bezpośredniego zapisu do bazy programu księgowego.

## Etap 3: płatności online

- jeden operator płatności wybrany po pilotażu, z BLIK i szybkim przelewem;
- każda organizacja łączy własne konto akceptanta, a środki trafiają bezpośrednio do właściwego odbiorcy;
- Epito używa strony płatności hostowanej przez operatora i nie przechowuje kodów BLIK, danych karty ani loginów bankowych;
- status `paid` powstaje wyłącznie po podpisanym webhooku operatora albo po uzgodnieniu wyciągu bankowego, nigdy po samym powrocie klienta do aplikacji;
- webhooki wymagają weryfikacji podpisu, ochrony przed powtórzeniem, klucza idempotencji, limitów i pełnego audytu.

Bezpośrednia integracja z mBankiem nie jest planowana w pierwszych etapach. Import standardowych wyciągów daje pokrycie wielu banków przy znacznie mniejszym koszcie wdrożenia i utrzymania.

## Źródła decyzji

- [API Wykazu podatników VAT](https://www.gov.pl/web/kas/api-wykazu-podatnikow-vat)
- [API REGON GUS](https://api.stat.gov.pl/home/regonapi)
- [VIES, informacje techniczne](https://ec.europa.eu/taxation_customs/vies/technicalInformation.html)
- [BLIK dla firm](https://www.blik.com/rozwiazania-dla-biznesu)
- [Cennik Stripe w Polsce](https://stripe.com/en-pl/pricing)
