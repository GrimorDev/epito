# Bezpieczeństwo i gotowość prawna Epito

Ten dokument opisuje zabezpieczenia techniczne oraz działania organizacyjne wymagane przed obsługą danych produkcyjnych. Nie zastępuje opinii prawnika ani doradcy ds. ochrony danych.

## Granice dostępu

- Każde biuro jest osobnym tenantem PostgreSQL.
- Konto klienta ma zakres `assigned_companies` i osobne przypisanie do firmy. RLS filtruje firmy, dokumenty i płatności również wtedy, gdy warstwa aplikacji popełni błąd.
- Helpdesk obsługuje zgłoszenia, ale nie ma dostępu do dokumentów i finansów.
- Wejście administratora, developera lub supervisora do danych organizacji jest operacją uprzywilejowaną i trafia do dziennika audytowego.
- Zmiana hasła, roli lub statusu zwiększa `auth_version`, co unieważnia istniejące sesje.

## Pliki i integracje

- Pliki są identyfikowane po sygnaturze lub bezpiecznej strukturze, a nie po nazwie i nagłówku MIME z przeglądarki.
- XML z DTD lub encjami jest odrzucany, co blokuje klasę ataków XXE.
- Tokeny KSeF są szyfrowane AES-256-GCM. Klucz nie może znajdować się w repozytorium.
- Epito nie powinno przechowywać numerów kart ani kodów BLIK. Integracja płatnicza może używać wyłącznie hostowanej strony PSP i podpisanych webhooków.

## Kopie i odtwarzanie

- Stack tworzy szyfrowane kopie bazy oraz dokumentów, sprawdza ich integralność i stosuje retencję.
- Kopia lokalna musi być replikowana poza VPS. Minimum jedna kopia powinna być logicznie odseparowana od konta administracyjnego serwera.
- Próbne odtworzenie wykonuj kwartalnie i zapisuj wynik, czas RTO oraz punkt RPO.

## Obowiązki przed produkcją

1. Ustalić role RODO: biuro zwykle jest administratorem danych swoich klientów, a operator Epito podmiotem przetwarzającym. Podpisać umowę powierzenia zgodną z art. 28 RODO.
2. Uzupełnić regulamin, politykę prywatności, listę podwykonawców, lokalizacje danych, procedurę realizacji praw osób oraz okresy retencji. Dokumenty powinien zatwierdzić prawnik znający model usługi.
3. Przeprowadzić analizę ryzyka; dla skali i zakresu danych rozważyć DPIA. Udokumentować podstawy prawne, cele i minimalizację danych.
4. Ustalić procedurę incydentową: triage, zabezpieczenie dowodów, kontakt do IOD/administratorów i ocenę obowiązku zgłoszenia naruszenia w 72 godziny.
5. Włączyć TLS z HSTS, wildcard DNS/certyfikat dla subdomen klientów, ograniczyć Portainer do administratorów i chronić go MFA/VPN.
6. Przed uruchomieniem płatności wdrożyć weryfikację podpisu webhooka, ochronę przed replay, idempotencję oraz uzgodnienie statusu z API PSP.
7. Przed szerokim wdrożeniem wymusić MFA co najmniej dla supervisora, administratorów i developerów. Pole `mfa_enabled` nie jest równoznaczne z gotowym procesem MFA.

## Retencja proponowana do zatwierdzenia

- dokumenty i zdarzenia księgowe: według obowiązku prawnego klienta i umowy, bez automatycznego skracania poniżej wymaganego okresu;
- logi bezpieczeństwa i audyt: 12–24 miesiące, zależnie od analizy ryzyka;
- zaproszenia do kont: 72 godziny dla aktywnego tokenu, historia statusu zgodnie z retencją audytu;
- kopie lokalne: 14 dni, kopie zewnętrzne zgodnie z uzgodnionym RPO/RTO;
- dane usuniętej organizacji: kontrolowany proces eksportu, blokady, usunięcia z systemu aktywnego i późniejszego wygaśnięcia z backupów.
