# FRAME Wallet

Prywatny portfel desktopowy SOL / ETH / BTC. Electron + React + TypeScript + Tailwind CSS 4.

Dwa motywy inspirowane referencjami: **Pop Control** (kremowy dashboard, intensywne kafelki, grube ramki, twarde cienie) i **Alien Signal** (ciemne panele, neonowe linie, siatka i monospace). W aplikacji: Personalizacja → motyw, akcent, gęstość, tekstura, animacje i nazwa.

## Pobranie instalatora

1. Zaloguj się do konta mającego dostęp do tego prywatnego repozytorium.
2. Otwórz **Releases**, wybierz najnowsze wydanie i rozwiń **Assets**.
3. Pobierz **FRAME-Wallet-0.1.0-Setup-x64.exe**. Archiwa „Source code” nie są instalatorem.
4. Opcjonalnie zweryfikuj sumę pliku przez `Get-FileHash .\FRAME-Wallet-0.1.0-Setup-x64.exe -Algorithm SHA256` i porównaj z `SHA256SUMS.txt`.
5. Uruchom instalator na Windows 10/11 x64. Instalator nie ma podpisu Authenticode, ponieważ projekt nie zawiera certyfikatu wydawcy.

Gdy build trwa, stan jest w **Actions → Build Windows installer**. Gotowy instalator jest też w artefakcie `FRAME-Wallet-Windows-x64`.

## Funkcje

- Generowanie BIP39 24 słowa z systemowego CSPRNG; import poprawnych angielskich fraz 12/15/18/21/24 słowa.
- Opcjonalna passphrase BIP39; kontrola dwóch słów podczas tworzenia kopii.
- Szyfrowany lokalny sejf AES-256-GCM + scrypt N=65536, r=8, p=1, losowa sól i IV. Minimum 12 znaków hasła.
- SOL: `@solana/web3.js`, ścieżka `m/44'/501'/0'/0'`, Mainnet i Devnet.
- ETH: ethers v6, `m/44'/60'/0'/0/0`, Mainnet i Sepolia; przelewy EIP-1559.
- BTC: bitcoinjs-lib v7, BIP84 P2WPKH, `m/84'/0'/0'/0/0` na Mainnet i `m/84'/1'/0'/0/0` na Testnet3.
- Prawdziwe salda z publicznych RPC / Esplora API, bez klucza API; błędy nie są zamieniane na zerowe salda.
- Odbiór z QR i kopiowaniem adresu. Przelew: wycena → sprawdzenie danych → ponowne hasło → systemowe potwierdzenie → lokalny podpis → rozgłoszenie.
- BTC: tylko potwierdzone UTXO, weryfikacja poprzednich transakcji i skryptu/wartości wejść, kontrola dust i opłaty; reszta na ten sam adres.
- Lokalna historia wysyłek z hashami i linkami do eksploratorów. Niepewny wynik rozgłoszenia jest jawny; aplikacja nie ponawia automatycznie przelewu.
- Automatyczna blokada po 5 minutach bezczynności i przy blokadzie/uśpieniu systemu. Ponowne wyświetlenie seeda po haśle, znika po 30 s.
- Renderer bez Node, sandbox, context isolation, ograniczony preload IPC, kontrola nadawcy i schematów, lokalny protokół `frame://`, CSP, blokada nawigacji i zewnętrznych zasobów.

## Zakres wersji 0.1

**Eksperymentalny hot wallet, bez niezależnego audytu.** Najpierw sprawdź sieci testowe i odzyskanie adresów z kopii. Nie jest to portfel sprzętowy. Złośliwe oprogramowanie urządzenia może odczytać dane podczas odblokowania; JavaScript nie gwarantuje wymazania wszystkich kopii stringów/kluczy w pamięci.

Obsługiwane są natywne SOL, ETH i BTC, jedno konto/adres na sieć. Brak SPL/ERC-20/NFT, dApps, WalletConnect, ENS, multisig, RBF fee bump i automatycznego wyszukiwania wszystkich kont z innych portfeli. Import frazy z innej aplikacji może wymagać dopasowania ścieżki; wersja 0.1 stosuje wyłącznie wymienione powyżej ścieżki. BTC używa jednego adresu odbioru/reszty, co ogranicza prywatność. Ethereum wysyła tylko na zwykłe konta bez kodu, SOL na adresy on-curve.

Domyślne środowisko **testnet** oznacza Devnet dla SOL, Sepolia dla ETH i Testnet3 dla BTC. Publiczne węzły/API mogą mieć limity, przerwy i ograniczenia geograficzne. Dostawcy widzą adresy i IP, nigdy seed ani klucz prywatny. Pełna historia sieciowa i potwierdzenia są w eksploratorze; lokalny rejestr nie jest indekserem blockchain.

## Uruchomienie z kodu

Wymagany Node.js 24 LTS i npm. Windows 10/11 x64 jest platformą instalatora.

```sh
npm ci
npm run dev
```

```sh
npm test
npm run build
node scripts/smoke.mjs
npm run dist:win
```

`npm run preview` daje tylko podgląd UI w przeglądarce: nie generuje seeda i nie podpisuje. Nie jest webowym portfelem.

Pliki sejfu i historii są w katalogu `app.getPath('userData')` aplikacji FRAME Wallet (Windows: `%APPDATA%\FRAME Wallet`). Hasła nie ma w repozytorium, ustawienia wyglądu nie zawierają sekretów. Odinstalowanie nie usuwa danych. Jeśli zapomnisz hasła, frazę z passphrase można przywrócić w kompatybilnym portfelu. Nie nadpisuj sejfu bez zapisanej i zweryfikowanej kopii.

## CI/CD

`.github/workflows/build.yml`: push/PR → testy → typecheck i build → test rzeczywistego Electron → instalator NSIS x64 → artefakty i SHA256. Push taga `v*` albo ręczne **Run workflow** z włączonym `release` tworzy prywatny prerelease. Pierwszy import źródeł także tworzy `v0.1.0`. Kolejne oficjalne wersje: zaktualizuj wersję w package.json/package-lock.json i wypchnij nowy tag.

Pierwsze przesłanie przez przeglądarkę może mieć transportowe `wallet-source.zip`. Pierwszy workflow materializuje je w zwykłe pliki źródłowe i usuwa archiwum w osobnym commicie; późniejsze zmiany to normalne commity. Archiwum nie zawiera zależności, danych portfela ani workflow. Wygenerowane zdjęcia testów zawierają wyłącznie powszechnie znaną testową frazę/adresy, nigdy portfel użytkownika.

Repozytorium i Releases pozostają prywatne. GitHub Actions wykorzystuje `GITHUB_TOKEN` ograniczony do repozytorium; nie wymaga PAT ani kluczy portfela. Klucze podpisujące instalator nie są skonfigurowane.
