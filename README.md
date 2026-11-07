# FRAME Wallet

Osobisty portfel desktopowy SOL / ETH / BTC / USDC oraz NFT Ethereum i Solana. Electron + React + TypeScript + Tailwind CSS 4.

Cztery motywy: **Pop Control** (kremowy dashboard, intensywne kafelki, grube ramki, twarde cienie) i **Alien Signal** (ciemne panele, neonowe linie, siatka i monospace). Do tego **Chroma Riot** (róż, pomarańcz, fiolet) i **Obsidian** (czerń i srebro). Personalizacja obejmuje motyw, akcent Alien, gęstość, teksturę heksagonalną oraz szybkość i intensywność animacji.

## Pobranie instalatora

1. Repozytorium i Releases są publiczne. Pobieranie instalatora nie wymaga konta.
2. Otwórz **Releases**, wybierz najnowsze wydanie i rozwiń **Assets**.
3. Pobierz **FRAME-Wallet-0.9.0-Setup-x64.exe**. Archiwa „Source code” nie są instalatorem.
4. Opcjonalnie zweryfikuj sumę pliku przez `Get-FileHash .\FRAME-Wallet-0.9.0-Setup-x64.exe -Algorithm SHA256` i porównaj z `SHA256SUMS.txt`.
5. Uruchom instalator na Windows 10/11 x64. Instalator nie ma podpisu Authenticode, ponieważ projekt nie zawiera certyfikatu wydawcy.

Gdy build trwa, stan jest w **Actions → Build Windows installer**. Gotowy instalator jest też w artefakcie `FRAME-Wallet-Windows-x64`.

## Poprawki 0.9

Stabilny focus okien i prywatnych szkiców profili. Czat: saldo aktywa i gazu, Max rezerwujący opłatę, kontrola własności NFT i zachowanie formularza. Społeczność: centralny feed, wątki, profile, kontakt i bufor nowych wpisów bez skoków przewijania. Szachy: lokalny komputer offline (Easy/Medium/Hard) w workerze, kolor i anulowanie obliczeń. Mintowanie: podgląd zgodny z CSP, automatyczny wybór miejsca zapisu według wielkości pliku, dokładne etapy błędów, potwierdzenie niezależne od indeksu galerii i wznowienie tej samej operacji.

[Przyczyny, testy, limity i stan testnetów 0.9](docs/0.9.0-TESTING.md). Wszystkie trzy RPC testnetów odpowiedziały na odczyt co najmniej raz 2026-11-07. Mintowanie na publicznych testnetach pozostaje **niepotwierdzone** z powodu braku środków/faucetu. Pełny mint PNG/TXT sprawdzono na lokalnym EVM, nie na sieci publicznej. Wersja 0.9 zachowuje dane i nie zmienia kluczy ani schematu sejfu.

## Nowości 0.8

NFT z pliku (w tym tekst i małe pliki binarne), SHA-256 i odzyskiwanie zapisanej transakcji; adapter Robinhood Chain (4663/46630), ręczny import ERC-20 i ERC-721/1155; przelewy EVM i NFT w czacie; publiczny profil ze szkicem i izolowanym HTML; forum Nostr oraz wygasający status online. **Gry** zastępują osobną zakładkę FRAME Run: sześć lokalnych gier działa offline. Zachowany tryb punktowy v1 pozostaje opcjonalny.

[Instrukcja, rzeczywiste wyniki testów, ograniczenia hostingu i sieci](docs/0.8.0-TESTING.md). Publiczne RPC Robinhood zwróciły w środowisku implementacji HTTP 403, więc rzeczywistego testnetu ani mainnetu nie przedstawiamy jako przetestowanych. Lokalny EVM i kontrola chain ID są testowane oddzielnie. Forum korzysta z relayów Nostr, nie z bezpośredniego Frame P2P. Brak obowiązkowego serwera developera.

## Nowości 0.7: FRAME Run

Geometryczna gra Canvas 2D w nawigacji portfela: trening bez limitu i weryfikowane rozgrywki do 90 sekund. Saldo FRAME pochodzi z serwerowej księgi SQLite, niezależnej od adresów i sieci. Bez skonfigurowanego konta serwera działa trening. [Uruchomienie backendu, konta, zasady i testy](docs/FRAME-RUN.md). Gra jest częścią aplikacji i instalatora 0.7.0. Trening działa bez serwera. Naliczanie FRAME wymaga skonfigurowanego serwera i konta; publiczny serwer nie jest dołączoną usługą.

## Nowości 0.6

Naprawiona oś czasu NIP-17, jednokierunkowe prośby o kontakt, prywatne podpisane nicki i awatary, małe obrazy E2EE, regulowane panele czatu, widok NFT wszystkich obsługiwanych sieci i wspólny resolver mediów, trwała paginowana aktywność, kategoria Stablecoiny oraz warianty ruchu Sześciokąty/Płynny/Wyłączone. Aktualizacja zachowuje klucze i tworzy zaszyfrowaną kopię historii przed migracją.

[Pełny opis, przyczyny problemów, test na dwóch kontach i konkretne ograniczenia](docs/0.6.0-TESTING.md). [Pochodzenie odtworzonych modułów 0.5.0 i zachowanie zgodności danych](docs/SOURCE-RECOVERY.md).

W źródłowym ZIP-ie nie ma gotowego EXE. Instalator jest oddzielnym zasobem Releases. Wydanie 0.5.0 pozostaje zachowane; jego automatyczne archiwa źródeł nie są pełnymi źródłami czatu. Od 0.6.0 ten projekt zawiera edytowalne moduły i testy zmian.

## Nowości 0.4

- **NFT → Posiadane / Odkrywaj / Utwórz**: Ethereum ERC-721/1155, Solana Core i Token Metadata. Odbiór pod adresem aktywnego portfela, szczegóły metadanych i wysyłanie. Eksploracja według adresu kolekcji lub konkretnego NFT nie wymaga jego posiadania.
- **USDC**: saldo i wysyłanie na Ethereum Mainnet/Sepolia oraz Solana Mainnet/Devnet. Wyłącznie oficjalny USDC Circle, 6 miejsc dziesiętnych; USDC.e i inne tokeny o podobnej nazwie nie są obsługiwane. Opłaty wymagają ETH/SOL.
- **Mintowanie**: pojedynczy NFT, pusta kolekcja i seria 1–20 NFT w istniejącej kolekcji. Ethereum korzysta z własnego `FrameCollection` ERC-721 (limit 10000), Solana z Metaplex Core. Dodawanie do kolekcji wymaga jej własności; Ethereum obsługuje tylko kolekcje utworzone w FRAME. Serie Solana to oddzielne transakcje: przy niepewnym wyniku aplikacja zatrzymuje serię i zapisuje hashe, bez automatycznego powtórzenia.
- **Metadane**: własny URI JSON HTTPS/IPFS do 200 znaków albo jawne przesłanie grafiki PNG/JPEG/WebP do 5 MB i JSON do Pinata. Przesłane pliki są publiczne. Utworzenie metadanych nie wykonuje mintowania.
- **Ustawienia → Ogólne**: przełącznik Mainnet/Testnet i język PL/EN. Domyślnie polski; język zapisuje się lokalnie. Każde uruchomienie wybiera Mainnet; zmiana środowiska unieważnia wyceny, dane i odpowiedzi poprzedniej sesji.
- **Ustawienia → Integracje**: własne klucze Alchemy (indeks NFT Ethereum), Helius (DAS Solana) i opcjonalny token Pinata (IPFS). Klucze zapisują się lokalnie z ochroną systemową; formularz po zapisie jest czyszczony. Aplikacja nie zawiera wspólnych kluczy ani wymyślonych sald. Bez indeksu można sprawdzić konkretny NFT po adresie i ID; przegląd całego portfela wymaga odpowiedniego klucza.
- Kontrakt i lokalne testy EVM: `contracts/FrameCollection.sol`, `scripts/compile-contract.mjs`, `tests/assets.test.ts`. Adaptery dostawców i podpisywanie: `electron/assets/`; interfejs: `src/components/NftDashboard.tsx`, `MintPanel.tsx`, `AssetOperation.tsx`, `UsdcPanel.tsx`; tłumaczenia: `shared/en.json` i `shared/i18n.ts`.

Dokumentacja integracji: [Alchemy](https://www.alchemy.com/docs/reference/nft-api-endpoints/nft-api-endpoints/nft-ownership-endpoints/get-nf-ts-for-owner-v-3), [Helius DAS](https://www.helius.dev/docs/api-reference/das/getassetsbyowner), [Metaplex Core](https://www.metaplex.com/docs/smart-contracts/core/create-asset), [Pinata](https://docs.pinata.cloud/api-reference/endpoint/upload-a-file), [adresy USDC Circle](https://developers.circle.com/stablecoins/usdc-contract-addresses).

Aktualizacja zachowuje sejf, wspólny PIN i dotychczasowy układ. Obejmuje też poprawkę geometrii ikon historii z 0.3.1.

## Funkcje 0.3

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

Zainstaluj 0.6 nad 0.2 na tym samym profilu Windows. Portfele, PIN i układ zostają zachowane, nie ma nowej migracji sejfu.

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

Zainstaluj 0.6 nad dotychczasową aplikacją. Przy pierwszym uruchomieniu podaj **dotychczasowe hasło jeden raz** i wybierz PIN aplikacji. Adresy, seed, passphrase i historia pierwszego portfela są zachowane. Stary zaszyfrowany plik `wallet.vault` pozostaje nienaruszony jako kopia; nowy sejf to `app.vault`. Nowe portfele mają osobne pliki lokalnej historii. Nie przenoś samego `app.vault` na inny profil Windows: jest powiązany z systemowym magazynem kluczy. Do przywrócenia na innym urządzeniu użyj seeda i passphrase każdego portfela. Wersja 0.1 nie rozumie nowych portfeli utworzonych w 0.2.

## Zakres i ograniczenia

**Eksperymentalny hot wallet, bez niezależnego audytu.** Najpierw sprawdź sieci testowe i odzyskanie adresów z kopii. Nie jest to portfel sprzętowy. Złośliwe oprogramowanie urządzenia może odczytać dane podczas odblokowania; JavaScript nie gwarantuje wymazania wszystkich kopii stringów/kluczy w pamięci.

Obsługiwane są natywne SOL, ETH i BTC, jedno konto/adres na sieć w każdym portfelu. Pozostałe SPL/ERC-20, Polygon/Base, handel na marketplace, dApps, WalletConnect, ENS, multisig, RBF i automatyczne wyszukiwanie wszystkich kont nie są obsługiwane. Skompresowane NFT Solana są tylko do odczytu. Ograniczenia lub dodatkowa autoryzacja konkretnego NFT mogą uniemożliwić transfer; aplikacja blokuje go po nieudanej symulacji. Import frazy z innej aplikacji może wymagać dopasowania ścieżki; wersja 0.6 stosuje wyłącznie wymienione powyżej ścieżki. BTC używa jednego adresu odbioru/reszty, co ogranicza prywatność. Ethereum wysyła tylko na zwykłe konta bez kodu, SOL na adresy on-curve.

Domyślnie aplikacja uruchamia **Mainnet**. Tryb **Testnet** oznacza Devnet dla SOL, Sepolia dla ETH i Testnet3 dla BTC. Publiczne węzły/API mogą mieć limity, przerwy i ograniczenia geograficzne. Dostawcy widzą adresy i IP, nigdy seed ani klucz prywatny. Historia w aplikacji korzysta z publicznych indeksów i RPC. Jej kompletność zależy od dostawców; szczegóły zweryfikujesz w eksploratorze. Historia natywnych monet nie indeksuje wszystkich operacji tokenów/NFT. Lokalne wysyłki NFT/USDC mają osobny dziennik; ich końcowy wynik należy sprawdzić w eksploratorze. Indeksy NFT mogą aktualizować własność z opóźnieniem.

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

`.github/workflows/build.yml`: push/PR → testy → typecheck i build → test rzeczywistego Electron → instalator NSIS x64 → artefakty i SHA256. Push taga `v*` albo ręczne **Run workflow** z włączonym `release` tworzy publiczne wydanie testowe. Import źródeł także tworzy tag zgodny z wersją `package.json`. Kolejne oficjalne wersje: zaktualizuj wersję w package.json/package-lock.json i wypchnij nowy tag.

Przesłanie aktualizacji przez przeglądarkę może mieć transportowe `wallet-source.zip`. Workflow materializuje je w zwykłe pliki źródłowe i usuwa archiwum w osobnym commicie; późniejsze zmiany to normalne commity. Archiwum nie zawiera zależności, danych portfela ani workflow. Zrzuty testów zawierają wyłącznie publiczne testowe adresy i fikstury historii, nigdy portfel użytkownika.

Repozytorium i Releases są publiczne. GitHub Actions wykorzystuje `GITHUB_TOKEN` ograniczony do repozytorium; nie wymaga PAT ani kluczy portfela. Klucze podpisujące instalator nie są skonfigurowane.

## Historia wersji na GitHubie

Każda aktualizacja powstaje na osobnym branchu `update/X.Y.Z` i trafia do `main` przez pull request. Branch aktualizacji pozostaje dostępny po scaleniu. Publikacja automatycznie zachowuje dodatkowy branch `versions/vX.Y.Z` wskazujący na kod wydania; istniejący branch wersji nie jest nadpisywany. Tagi `vX.Y.Z` są punktami odniesienia dla Releases i starszych instalatorów.

- **Branches**: wybierz `versions/v0.1.0`, `versions/v0.2.0` lub późniejszą wersję, aby obejrzeć dawny kod.
- **Tags / Releases**: wybierz tag, aby zobaczyć kod i pobrać instalator tej wersji.
- **Pull requests**: historia zmian i wyników testów kolejnych aktualizacji.

Nie usuwaj starych tagów ani branchy `versions/*`. Uruchamianie starego instalatora nie jest migracją danych wstecz; przywracanie dostępu do środków wymaga seedów i passphrase.

Konwersje liczb SPL używają lokalnego modułu `vendor/bigint-buffer` bez natywnego dodatku `bigint-buffer` (CVE-2025-3194). Ganache jest wyłącznie zależnością testową i nie trafia do instalatora. Testy EVM działają na lokalnym łańcuchu, a Solana i dostawcy na kontrolowanych odpowiedziach; nie stanowią testu na finansowanych sieciach publicznych.
