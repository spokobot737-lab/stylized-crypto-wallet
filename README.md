# FRAME Wallet

Prywatny portfel desktopowy SOL / ETH / BTC. Electron + React + TypeScript + Tailwind CSS 4.

Cztery motywy: **Pop Control** (kremowy dashboard, intensywne kafelki, grube ramki, twarde cienie) i **Alien Signal** (ciemne panele, neonowe linie, siatka i monospace). Do tego **Chroma Riot** (róż, pomarańcz, fiolet) i **Obsidian** (czerń i srebro). Personalizacja obejmuje motyw, akcent Alien, gęstość, teksturę heksagonalną oraz szybkość i intensywność animacji.

## Pobranie instalatora

1. Zaloguj się do konta mającego dostęp do tego prywatnego repozytorium.
2. Otwórz **Releases**, wybierz najnowsze wydanie i rozwiń **Assets**.
3. Pobierz **FRAME-Wallet-0.3.0-Setup-x64.exe**. Archiwa „Source code” nie są instalatorem.
4. Opcjonalnie zweryfikuj sumę pliku przez `Get-FileHash .\FRAME-Wallet-0.3.0-Setup-x64.exe -Algorithm SHA256` i porównaj z `SHA256SUMS.txt`.
5. Uruchom instalator na Windows 10/11 x64. Instalator nie ma podpisu Authenticode, ponieważ projekt nie zawiera certyfikatu wydawcy.

Gdy build trwa, stan jest w **Actions → Build Windows installer**. Gotowy instalator jest też w artefakcie `FRAME-Wallet-Windows-x64`.

## Nowości 0.3

- Start aplikacji zawsze na Mainnet, również po restarcie z trybu testowego. W oknie przejścia z Testnet można zaznaczyć „Nie pokazuj ponownie”. Ustawienia → Ogólne → „Potwierdzaj przejście na Mainnet” przywraca lub wyłącza to okno. Nie zmienia potwierdzenia wysyłania środków.
- Personalizacja jest w **Ustawienia → Wygląd**, bez osobnego przycisku w panelu bocznym. Profil również prowadzi do Ustawień.
- Własna ikona F w sześciokącie dla okna, EXE i instalatora Windows (wiele rozdzielczości ICO), pliki ICNS dla macOS i PNG dla Linux. Generowanie z geometrii SVG: `python scripts/generate-icons.py` z Pillow. CI publikuje instalator Windows x64.

- Kopiowanie adresów i hashy przez systemowy schowek Electron; sukces dopiero po odczycie zwrotnym. Błąd zapisu jest widoczny. Dotyczy kart, odbioru i historii.
- Cztery motywy, poprawne lokalne SVG kryptowalut, znak F w sześciokącie i subtelna siatka heksagonalna.
- Historia aktywnego adresu obejmuje przychodzące, wychodzące i własne transfery natywnych SOL, ETH, BTC. Ethereum: również transfery wewnętrzne z Routescan. Solana: instrukcje systemowe, w tym wewnętrzne; inne operacje oznaczone jako zmiana salda. BTC: reszta nie jest liczona jako wysłana kwota; wieloadresowe wejścia są oznaczone jako zmiana salda.
- Filtry kierunku, sieci, nieudanych i pozostałych operacji; wyszukiwanie adresu/hashu. Można ukryć całą historię lub kwotę, datę, godzinę, sieć, status, opłatę, adresy, hash, liczbę potwierdzeń i blok/slot. Ukrycie historii wstrzymuje jej automatyczne odświeżanie.
- Źródła: Solana RPC (8 transakcji na stronę), Routescan Etherscan-compatible API (25 zwykłych i 25 wewnętrznych na stronę), Blockstream Esplora (najnowsze i starsze strony). Publiczne indeksowanie może być opóźnione lub niepełne. Błędy dostawców wyświetlają się osobno dla sieci, nie jako fałszywe zerowe saldo czy pusta pełna historia. Starsze transakcje: przyciski „Starsze SOL/ETH/BTC”.
- Opłata to opłata całej transakcji; aplikacja oznacza, gdy płatnikiem nie jest aktywny adres albo nie da się go ustalić. Brakujące dane pozostają niedostępne. Nieudane transfery mają kwotę wykonaną 0.
- Płynne przejścia paneli, dialogów i układu kart; ustawienia szybkości/intensywności, pełne wyłączenie i respektowanie `prefers-reduced-motion`.
- Test Windows sprawdza rzeczywisty schowek OS i UI na deterministycznych, wyłącznie testowych odpowiedziach historii. Nie wysyła środków. Zrzuty w Releases zawierają dane testowe.

Zainstaluj 0.3 nad 0.2 na tym samym profilu Windows. Portfele, PIN i układ zostają zachowane, nie ma nowej migracji sejfu.

## Funkcje odziedziczone z 0.2

- **Wiele portfeli**: tworzenie, import, własne nazwy, szybki wybór w lewym panelu; aktywny portfel zapamiętywany po restarcie. Limit 50 portfeli. Historie wysyłek są oddzielne.
- **Jeden PIN aplikacji (6–12 cyfr)**: odblokowuje cały interfejs i wszystkie portfele. Przełączanie, dodawanie i wysyłanie nie wymagają kolejnych haseł. Przelew nadal wymaga przeglądu danych i systemowego potwierdzenia.
- Sejf AES-256-GCM z scrypt N=65536, r=8, p=1. Klucz jest wyprowadzany z PIN-u oraz losowego sekretu chronionego przez systemowy magazyn kluczy Electron safeStorage (Windows DPAPI). Brak niechronionego fallbacku. Licznik i opóźnienia błędnych prób PIN przeżywają restart.
- BIP39: generowanie 24 słów, import angielskich fraz 12/15/18/21/24 słowa; opcjonalna passphrase. Każdy nowy portfel ma niezależny seed. PIN nie zastępuje kopii BIP39.
- SOL Mainnet / Devnet: `m/44'/501'/0'/0'`.
- ETH Mainnet / Sepolia: `m/44'/60'/0'/0/0`, EIP-1559.
- BTC Mainnet / Testnet3: BIP84 P2WPKH, `m/84'/0'/0'/0/0` i `m/84'/1'/0'/0/0`.
- Salda z publicznych RPC / Esplora API; zerowe salda zawsze jako `0`, bez zbędnych miejsc dziesiętnych. Bardzo małe kwoty zachowują precyzję.
- Kafelki: przeciąganie lub strzałki zmieniają kolejność. Przyciski − / + zmieniają rozmiar każdego kafelka. Personalizacja oferuje również wspólny domyślny rozmiar. Układ zapisuje się lokalnie i działa dla wszystkich portfeli.
- Profil w prawym górnym rogu: lista i nazwy portfeli, personalizacja, kopia zapasowa, zmiana PIN-u, informacje o bezpieczeństwie i blokada.
- Uproszczona strona główna bez banerów i sloganów; poprawione tło, tekst, pola i menu w czterech wariantach Alien Signal. CI sprawdza kontrast głównych powierzchni i dialogu dla wszystkich akcentów.
- Odbiór z QR, lokalne podpisywanie, kontrola UTXO BTC i opłat. Zmiana aktywnego portfela unieważnia poprzednie wyceny i odrzuca spóźnione odpowiedzi sald.
- Automatyczna blokada po 5 minutach bezczynności oraz przy blokadzie/uśpieniu systemu. Wyświetlenie seeda wymaga ponownego PIN-u i znika po 30 sekundach.
- Renderer bez Node, sandbox, context isolation, walidowane IPC, lokalny protokół `frame://`, CSP i blokada zewnętrznej nawigacji.

## Aktualizacja z 0.1

Zainstaluj 0.3 nad dotychczasową aplikacją. Przy pierwszym uruchomieniu podaj **dotychczasowe hasło jeden raz** i wybierz PIN aplikacji. Adresy, seed, passphrase i historia pierwszego portfela są zachowane. Stary zaszyfrowany plik `wallet.vault` pozostaje nienaruszony jako kopia; nowy sejf to `app.vault`. Nowe portfele mają osobne pliki lokalnej historii. Nie przenoś samego `app.vault` na inny profil Windows: jest powiązany z systemowym magazynem kluczy. Do przywrócenia na innym urządzeniu użyj seeda i passphrase każdego portfela. Wersja 0.1 nie rozumie nowych portfeli utworzonych w 0.2.

## Zakres i ograniczenia

**Eksperymentalny hot wallet, bez niezależnego audytu.** Najpierw sprawdź sieci testowe i odzyskanie adresów z kopii. Nie jest to portfel sprzętowy. Złośliwe oprogramowanie urządzenia może odczytać dane podczas odblokowania; JavaScript nie gwarantuje wymazania wszystkich kopii stringów/kluczy w pamięci.

Obsługiwane są natywne SOL, ETH i BTC, jedno konto/adres na sieć w każdym portfelu. Brak SPL/ERC-20/NFT, dApps, WalletConnect, ENS, multisig, RBF fee bump i automatycznego wyszukiwania wszystkich kont z innych portfeli. Import frazy z innej aplikacji może wymagać dopasowania ścieżki; wersja 0.3 stosuje wyłącznie wymienione powyżej ścieżki. BTC używa jednego adresu odbioru/reszty, co ogranicza prywatność. Ethereum wysyła tylko na zwykłe konta bez kodu, SOL na adresy on-curve.

Domyślnie aplikacja uruchamia **Mainnet**. Tryb **Testnet** oznacza Devnet dla SOL, Sepolia dla ETH i Testnet3 dla BTC. Publiczne węzły/API mogą mieć limity, przerwy i ograniczenia geograficzne. Dostawcy widzą adresy i IP, nigdy seed ani klucz prywatny. Historia w aplikacji korzysta z publicznych indeksów i RPC. Jej kompletność zależy od dostawców; szczegóły zweryfikujesz w eksploratorze. SPL/ERC-20/NFT nie są wykazywane.

## Uruchomienie z kodu

Wymagany Node.js 24 LTS i npm. Windows 10/11 x64 jest platformą instalatora.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
node --import tsx scripts/smoke.mjs
npm run dist:win
```

`npm run preview` daje tylko podgląd UI w przeglądarce: nie generuje seeda i nie podpisuje. Nie jest webowym portfelem.

Pliki sejfu i historii są w katalogu `app.getPath('userData')` aplikacji FRAME Wallet (Windows: `%APPDATA%\FRAME Wallet`). PIN-u i sekretu urządzenia nie ma w repozytorium, ustawienia wyglądu nie zawierają sekretów. Odinstalowanie nie usuwa danych. Jeśli zapomnisz PIN-u, frazę z passphrase można przywrócić w kompatybilnym portfelu. Nie nadpisuj sejfu bez zapisanej i zweryfikowanej kopii.

## CI/CD

`.github/workflows/build.yml`: push/PR → testy → typecheck i build → test rzeczywistego Electron → instalator NSIS x64 → artefakty i SHA256. Push taga `v*` albo ręczne **Run workflow** z włączonym `release` tworzy prywatny prerelease. Import źródeł także tworzy tag zgodny z wersją `package.json`. Kolejne oficjalne wersje: zaktualizuj wersję w package.json/package-lock.json i wypchnij nowy tag.

Przesłanie aktualizacji przez przeglądarkę może mieć transportowe `wallet-source.zip`. Workflow materializuje je w zwykłe pliki źródłowe i usuwa archiwum w osobnym commicie; późniejsze zmiany to normalne commity. Archiwum nie zawiera zależności, danych portfela ani workflow. Zrzuty testów zawierają wyłącznie publiczne testowe adresy i fikstury historii, nigdy portfel użytkownika.

Repozytorium i Releases pozostają prywatne. GitHub Actions wykorzystuje `GITHUB_TOKEN` ograniczony do repozytorium; nie wymaga PAT ani kluczy portfela. Klucze podpisujące instalator nie są skonfigurowane.

## Historia wersji na GitHubie

Każda aktualizacja powstaje na osobnym branchu `update/X.Y.Z` i trafia do `main` przez pull request. Branch aktualizacji pozostaje dostępny po scaleniu. Publikacja automatycznie zachowuje dodatkowy branch `versions/vX.Y.Z` wskazujący na kod wydania; istniejący branch wersji nie jest nadpisywany. Tagi `vX.Y.Z` są punktami odniesienia dla Releases i starszych instalatorów.

- **Branches**: wybierz `versions/v0.1.0`, `versions/v0.2.0` lub późniejszą wersję, aby obejrzeć dawny kod.
- **Tags / Releases**: wybierz tag, aby zobaczyć kod i pobrać instalator tej wersji.
- **Pull requests**: historia zmian i wyników testów kolejnych aktualizacji.

Nie usuwaj starych tagów ani branchy `versions/*`. Uruchamianie starego instalatora nie jest migracją danych wstecz; przywracanie dostępu do środków wymaga seedów i passphrase.
