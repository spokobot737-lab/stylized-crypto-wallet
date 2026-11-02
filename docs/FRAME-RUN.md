# FRAME Run

FRAME Run jest zakładką w lewym panelu istniejącego portfela React/Electron, obok NFT i Chat. Gra działa w tym samym oknie aplikacji, przez jej produkcyjny renderer i preload. **Trening działa bez serwera i konta punktowego.** Tryb punktowy korzysta z niezależnego serwera Node i trwałego SQLite. Nie ma tokena blockchainowego ani obietnicy wartości pieniężnej FRAME.

## Uruchomienie

Wymagany Node 24 z `node:sqlite` oraz istniejące zależności projektu:

```sh
npm ci
npm run dev
```

W portfelu wybierz **FRAME Run**. Spacja, kliknięcie lub dotknięcie planszy wykonuje skok. Zderzenie kończy rundę; limit to 90 sekund. Dźwięk można włączyć w nagłówku. Trening i gra punktowa mają osobne rekordy, a wynik rundy jest odrębny od salda FRAME.

Do samego treningu w przeglądarce służy `npm run preview`. Zdalne konto punktowe obsługuje wyłącznie most Electron, aby token nie trafił do localStorage ani żądań renderera.

## Minimalny serwer i uwierzytelnianie

Projekt przed tą zmianą miał lokalny PIN i sejf, ale nie miał zdalnego konta. Nie można utożsamić lokalnego PIN-u z bezpiecznym logowaniem do serwera. Dlatego serwer przyjmuje konta provisionowane przez operatora: **stały UUID konta oraz losowy token dostępu**. Nie używa adresu portfela, wybranej sieci ani salda krypto jako tożsamości.

Przykład lokalnego uruchomienia w Bash, w katalogu projektu:

```sh
umask 077
node -e "const c=require('node:crypto'); console.log(JSON.stringify([{id:c.randomUUID(),token:c.randomBytes(32).toString('hex')}]))" > .env.frame-run-accounts.json
export FRAME_RUN_ACCOUNTS="$(cat .env.frame-run-accounts.json)"
export FRAME_RUN_DB="$PWD/frame-run.sqlite"
npm run game:server
```

Plik `.env.frame-run-accounts.json` i pliki SQLite są ignorowane przez Git. Zapisz ten plik bezpiecznie: ponowne wygenerowanie UUID tworzy inne konto. Dla kolejnych kont dodaj inne UUID i token do tablicy JSON. Jedno konto ma jeden aktywny token; zmiana tokenu przy zachowaniu UUID nie zmienia jego salda. Usunięcie konta z konfiguracji i restart serwera odbiera dostęp. Token daje dostęp do punktów, należy przekazywać go prywatnie. Nie udostępniaj go razem z instalatorem.

Windows PowerShell, po przygotowaniu takiego samego pliku JSON:

```powershell
$env:FRAME_RUN_ACCOUNTS = Get-Content .env.frame-run-accounts.json -Raw
$env:FRAME_RUN_DB = "$PWD/frame-run.sqlite"
npm run game:server
```

Domyślnie serwer słucha na `127.0.0.1:8787`. W grze rozwiń **Konto serwera FRAME Run**, wpisz `http://127.0.0.1:8787` i token właściwego konta. Zdalny adres musi używać HTTPS i wskazywać główny adres serwera bez ścieżki, parametrów i przekierowań. Połączenie, oczekujące rozliczenie i znacznik aktywnej rundy korzystają z istniejącego systemowego magazynu portfela i atomowego zapisu plików. Brak bezpiecznego magazynu systemowego nie jest zastępowany jawnym zapisem.

Przed publikacją trzeba uruchomić własny serwer, zapewnić HTTPS, nadzór procesu, kopie i trwały wolumin SQLite oraz prywatne wydawanie/rotację tokenów. Nie wdrożono publicznej rejestracji, odzyskiwania kont ani dostawcy logowania. Nie są wymagane płatne API; utrzymanie publicznego serwera wymaga infrastruktury operatora. Dołączony serwer jest warstwą minimalną, nie usługą już wdrożoną na produkcji. Baza na lokalnym dysku jednego hosta; nie należy współdzielić SQLite przez sieciowy system plików ani uruchamiać replik z osobnymi bazami.

Za reverse proxy ustaw limit rozmiaru żądania 32 KiB i własne limity połączeń. Wbudowany limit wynosi 120 żądań/min/IP oraz 40 prób rozpoczęcia/rozliczenia/min/konto; nagłówki `X-Forwarded-For` nie są uznawane za zaufane. Przy proxy limit IP dotyczy adresu proxy, więc ustaw limity odpowiednio do liczby użytkowników. Nagrody nie wymagają transakcji, zakupu ani podpisu kluczem portfela.

## Zasady i odtwarzanie

`shared/frame-run/simulation.ts` zawiera wersjonowane zasady v1, generator v1 i format wejść v1. Serwer dołącza konfigurację do sesji i zapisuje jej kopię. Parametry początkowe: minimum 900 kroków/15 s, 1 FRAME za pełne 600 kroków/10 s, maksymalnie 9 FRAME/rundę i 30 FRAME/konto/dzień UTC. Reset o 00:00 UTC jest widoczny również jako lokalna data i godzina. Za 15 s przysługuje 1 FRAME. Po wykorzystaniu limitu pozostaje trening.

Symulacja używa kroku 1/60 s, całkowitoliczbowych współrzędnych i xorshift32. React nie jest aktualizowany w każdej klatce. Renderer i serwer importują ten sam moduł; sekwencja przeszkód zależy wyłącznie od ziarna. Minimalny odstęp 100 kroków jest większy od czasu pojedynczego skoku, a wysokość przeszkód pozostaje poniżej osiągalnej wysokości skoku także przy maksymalnej prędkości. Wersjonowanie obejmuje również stałe fizyki i generatora. Zmiana reguł wymaga nowej wersji i zachowania starego weryfikatora do wygaśnięcia starych sesji albo kontrolowanego zatrzymania startów na 10 minut przed aktualizacją. Nie zmieniaj stałych pod istniejącym numerem wersji.

Serwer tworzy UUID rundy, kryptograficznie losowane ziarno oraz czasy startu i wygaśnięcia (10 minut). Klient wysyła tylko wersje, UUID, krok zakończenia i do 600 uporządkowanych kroków wejścia. Nie ma pola na deklarowany wynik, saldo ani nagrodę. Serwer odtwarza grę do kolizji/90 s, sprawdza krok końca, upływ czasu serwera i sam oblicza wynik. Runda nie może zakończyć się więcej niż 35 ms przed wynikającym z kroków czasem serwera. Odtwarzanie nie dowodzi obecności człowieka: bot może wygenerować poprawne wejścia i odczekać wymagany czas; nie ma też pełnej ochrony przed wieloma kontami.

SQLite `BEGIN IMMEDIATE`, unikalna aktywna runda konta i unikalne powiązanie wpisu księgi z rundą zapewniają wspólne atomowe rozliczenie i limit dzienny. Zapisany skrót wejść oraz pełna odpowiedź zapewniają identyczne ponowienie, również gdy serwer zatwierdził punkty, ale odpowiedź zginęła. Zmieniony zapis już rozliczonej rundy jest odrzucany. Dzień przyznania jest dniem UTC **rozliczenia na serwerze**.

Wyjście z widoku, zmiana portfela/sieci, ukrycie dokumentu, zablokowanie systemu/aplikacji lub pauza klatek powyżej sekundy przerywają trwającą rundę. Po restarcie znacznik nierozliczonej aktywnej rundy powoduje jej anulowanie. Anulowanie offline jest zapisane i ponawiane po odzyskaniu połączenia. Jeśli start został przyjęty na serwerze, ale jego odpowiedź nie dotarła do klienta, konto może czekać do wygaśnięcia sesji (10 minut). Gotowy wynik wysłany do rozliczenia może zostać zatwierdzony przed dotarciem późniejszego anulowania; zatwierdzonych operacji nie cofamy automatycznie.

Po błędzie wysyłki pozostań na ekranie wyniku i wybierz **Ponów weryfikację wyniku**. Zaszyfrowany zapis zakończonej rundy przeżywa wyjście z ekranu wyniku i restart. Oczekujący zapis blokuje zmianę konta punktowego i start kolejnej rundy nagradzanej; trening pozostaje dostępny. Jest też jawne porzucenie wyniku. Saldo pochodzi wyłącznie z serwera. localStorage przechowuje jedynie wyciszenie i rekord treningowy.

## Księga i przyszłe nagrody

`server/frame-run/store.ts` zawiera operacje `grant`, `spend`, `refund` i `correction` z unikalnym ID, datą, przyczyną i powiązaniem z rundą/rezerwacją. `catalog.ts` definiuje rozszerzalny model nagród; katalog jest pusty i nie ma sugerujących dostępność przycisków w interfejsie.

Wewnętrzne metody serwera obsługują rezerwację punktów, potwierdzenie lub jednorazowy zwrot; nie są udostępnione jako publiczne endpointy. Przyszły handler realizacji musi używać ID rezerwacji jako klucza idempotencji. Przy nieznanym wyniku zewnętrznej dostawy najpierw należy uzgodnić stan dostawy, nie zwracać środków automatycznie. Nie wdrożono dostawcy nagród, tokena, NFT ani smart kontraktu.

## Weryfikacja

```sh
npm run test:game
npm test
npm run test:game:ui
```

Testy obejmują deterministyczność dla tych samych wejść, przeżywalne sekwencje generatora, kolizję, progi 15/20/90 s, manipulację wejściami/wynikiem, czas serwera, wygasanie, powtórzenia i izolację kont. Osobne workery SQLite rywalizują o rozliczenie przy limicie 30 FRAME. Test mostu symuluje zatwierdzenie przy utraconej odpowiedzi, restart, ponowienie, blokadę, anulowanie i porzuconą rundę. Dodatkowy test `scripts/ui-frame-run-wallet.mjs` uruchamia skompilowany główny proces Frame Wallet, odblokowany testowy portfel i produkcyjny renderer `frame://app/`. Sprawdza wejście do gry, trening, powrót do portfela i blokadę przez rzeczywiste IPC. W tym teście niepowiązane panele sald i historii otrzymują puste odpowiedzi testowe, żeby nie wywoływać publicznych RPC; obsługa gry i jej IPC pozostają produkcyjne. Na Windows używa właściwego wejścia aplikacji i magazynu systemowego. Lokalny test na Linux używa wyłącznie testowej osłony dla niedostępnej blokady pojedynczej instancji i testowego magazynu zamiast nieobecnego keyringu. Osłona nie jest częścią instalatora. Workflow Windows uruchamia ten test przed pakowaniem EXE.

Test UI sprawdza spację, kliknięcie i zdarzenie dotykowego pointera, wyciszenie, wynik, restart treningu, wyjście z widoku i układ 1440/420 px.

Automatyzacja UI działa na Electronie z renderowaniem poza ekranem. Test zdarzenia dotykowego nie zastępuje testu na fizycznym telefonie. Nie potwierdzono publicznego wdrożenia HTTPS, realnego wydawania kont, działania w docelowym instalatorze Windows ani obsługi dużego ruchu. Te kontrole należy wykonać przed publikacją punktów dla użytkowników.
