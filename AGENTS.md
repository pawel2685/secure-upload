# CLAUDE.md

Instrukcje dla Claude'a pracującego w tym repo. Czytaj przed każdym zadaniem.

## Projekt

Temat P6: **Bezpieczne przesyłanie plików (Secure Upload)**, przedmiot Bezpieczeństwo Aplikacji Internetowych, LAB/PROJ 2026.

Jedna aplikacja z dwiema wersjami logiki uploadu:
**vulnerable**: celowo dziurawa (bez walidacji, oryginalne nazwy plików, SQL sklejany stringiem)
**secure**: zabezpieczona (walidacja zawartości, losowe nazwy UUID, limity, zapytania parametryzowane, kontrola właściciela)

Cel: pokazać ataki na wersji podatnej, zablokować je w zabezpieczonej i potwierdzić to testami.

Zespół: 2 osoby, developer (aplikacja i zabezpieczenia) i tester (ataki, testy automatyczne, wyniki).

## Struktura repo

secure-upload/
├── CLAUDE.md
├── README.md            (instrukcja uruchomienia)
├── schema.sql           (struktura bazy MySQL)
├── docs/                (dokumentacja do sprawozdania, folder nadrzędny dla frontendu i backendu)
├── frontend/            (React + Vite + TypeScript, localhost:5173)
└── backend/             (Node + Express + TypeScript, 127.0.0.1:3000)
    ├── src/
    │   ├── server.ts
    │   ├── db.ts
    │   └── routes/
    │       ├── vulnerable.ts
    │       └── secure.ts
    ├── tests/           (Jest + Supertest)
    └── uploads/
        ├── vulnerable/
        └── secure/

Endpointy: `/api/vulnerable/upload|download` oraz `/api/secure/upload|download`.

## Stos technologiczny

- Frontend: React, Vite, TypeScript, ESLint
- Backend: Node.js, Express 5, TypeScript, Multer, mysql2
- Baza: MySQL (metadane plików: właściciel, nazwa, typ, rozmiar, ścieżka)
- Testy: Jest + Supertest, raport test coverage (cel min. 80%)
- Ataki ręczne: Burp Suite, curl
- Lint: ESLint (+ `eslint-plugin-security` w backendzie)

## Zasady kodu

- Backend ma `"type": "module"`. Importy własnych plików piszemy z `.js` na końcu, np. `import { router } from './routes/secure.js'`.
- Serwer nasłuchuje **tylko na `127.0.0.1`**, bo wersja podatna jest naprawdę dziurawa. Nie zmieniać na `0.0.0.0`.
- Podatny kod ma w komentarzu `// VULNERABLE:` z krótkim opisem błędu. Zabezpieczony ma `// SECURE:` z opisem ochrony.
- Nie commitować: `node_modules/`, `dist/`, `coverage/`, `.env`, `backend/uploads/`.
- Praca na branchach (`feature/...`) i Pull Requesty, nie bezpośrednio na `main`. Commity po polsku lub angielsku, ale krótkie i konkretne.
- Testy piszemy raz i puszczamy na obu wersjach (`describe.each(['vulnerable', 'secure'])`). W podatnej atak ma się udać, w zabezpieczonej zostać zablokowany.

## Dokumentacja (folder `docs/`)

`docs/` leży w głównym folderze repo, obok `frontend/` i `backend/`. Dotyczy całego projektu, nie jednej części.

**Kiedy pisać:** dopiero gdy kod etapu jest gotowy i przetestowany (nie w trakcie, nie "na zapas"). Dokument do `docs/` dopisujemy **w tym samym branchu/PR co kod tego etapu**, jako kolejny commit przed mergem — nie w osobnym branchu po fakcie. Jeden etap = jeden PR (kod + opis), nie dwa.

**Gdzie:**
docs/
├── 01-wstep.md          (pisze użytkownik sam, Claude tego nie dotyka)
├── 02-srodowisko.md     (technologie, architektura, struktura)
├── 03-zagrozenia.md     (ataki na upload, odniesienia OWASP)
├── 04-wersja-podatna.md
├── 05-wersja-zabezpieczona.md
├── 06-testy-wyniki.md   (scenariusze, tabela atak / przed / po, coverage)
├── 07-formularz.md      (instrukcja dla osoby robiącej frontend: jak podłączyć formularz do gotowego API)
├── 08-wnioski.md        (dopiero po uruchomieniu całej apki z frontendem, nie wcześniej)
└── img/                 (zrzuty ekranu)

Bibliografii (`08-bibliografia.md`) nie piszemy — wywalona ze scope.

**Limit:** całe sprawozdanie ma około 10 stron. Budżet stron:

| Plik | Strony |
|---|---|
| 01 wstęp | 0,5 |
| 02 środowisko | 1 |
| 03 zagrożenia | 1 |
| 04 wersja podatna | 1,5 |
| 05 wersja zabezpieczona | 1,5 |
| 06 testy i wyniki | 2,5 |
| 07 formularz | 1 |
| 08 wnioski | 0,5 |

Główny ciężar to pliki 04, 05 i 06. Etap 1 (repo, szkielet, `/api/health`) to maksymalnie jedno-dwa zdania w `02-srodowisko.md` plus jeden zrzut struktury folderów. Problemów konfiguracyjnych (np. `verbatimModuleSyntax`) nie opisujemy.

**Styl dokumentacji:**
krótko i konkretnie, po polsku, normalnym językiem, bez akademickiego lania wody
nie wdawać się w szczegóły, których nie ma w budżecie stron
zrzutów ekranu Claude nie robi. W miejscu, gdzie zrzut jest potrzebny, wstawia w tekście adnotację `> **[ZRZUT EKRANU DO DODANIA: opis]**`, a użytkownik robi zrzut i dodaje go w końcowym sprawozdaniu
tabelki tam, gdzie porównujemy (atak / wynik w podatnej / wynik w zabezpieczonej)

## Scope testów

- IN SCOPE: aplikacja lokalnie (`localhost`), frontend React, backend Express, endpointy upload/download/lista plików, lokalna baza MySQL, 2 konta testowe (user1, user2) wpisane na sztywno, własne pliki testowe, obie wersje aplikacji.
- OUT OF SCOPE: wszystko poza naszym komputerem, testy obciążeniowe i DoS, prawdziwe logowanie i rejestracja, wdrożenie na serwer.

## Scenariusze testowe

1. Podmiana rozszerzenia i zawartości (`shell.php.jpg`)
2. Path traversal w nazwie pliku (`../../x`)
3. Za duży plik
4. SVG/HTML z XSS
5. Pobranie cudzego pliku przez zgadnięcie ID
6. SQL injection w nazwie pliku
7. Testy automatyczne Jest dla obu wersji, pokrycie min. 80%

Odniesienia: OWASP ASVS 5.0.0 (wymagania), OWASP WSTG 4.2 (weryfikacja).

## Jak ma pracować Claude

- Odpowiedzi krótkie, po polsku, bez zbędnych szczegółów. Robić jeden krok naraz, jeśli użytkownik prowadzi przez konfigurację.
- Nie dodawać funkcji spoza scope (np. prawdziwego logowania) bez pytania.
- Nie ruszać wersji podatnej "na lepsze". Jej dziury są celowe i opisane w dokumentacji.
- Przed większą zmianą struktury zapytać
- Git: tylko odczyt (`git status`, `git log`, `git diff`, `git branch --show-current`) i tworzenie branchy (`feature/...`, `docs/...`) pod kolejne punkty/etapy. Nie robić `commit`, `push`, merge ani PR-ów — to robi użytkownik sam. Nie commitować CLAUDE.md (jest w .gitignore).
- Jak zadanie jest skończone i przetestowane, nie pytać czy je zacommitować — od razu napisać "gotowe do zacommitowania" i podać gotową treść komunikatu commita (user wkleja i commituje sam).
- Do commitów i opisów PR nie dodawać linii `Co-Authored-By` ani stopki "Generated with Claude Code". Zwykłe, krótkie komunikaty.
