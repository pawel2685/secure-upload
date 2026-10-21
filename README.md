# Secure Upload

Projekt P6: bezpieczne przesyłanie plików. Jedna aplikacja, dwie wersje uploadu: `vulnerable` (celowo podatna) i `secure` (zabezpieczona). Szczegóły w [docs/](docs/).

## Wymagania

- Node.js 20+ (testowane na 25)
- MySQL 8

## Uruchomienie krok po kroku

### 1. Baza danych (MySQL)

Potrzebujesz działającego lokalnie serwera MySQL i użytkownika z prawem tworzenia baz (najprościej: `root`).

Zaimportuj strukturę — polecenie samo tworzy bazę `secure_upload` i tabelę `files`:
```
mysql -u root -p < schema.sql
```
Zostaniesz zapytany o hasło roota. Jeśli root nie ma hasła, pomiń `-p`.

Sprawdzenie, że baza istnieje:
```
mysql -u root -p -e "USE secure_upload; SHOW TABLES;"
```
Powinna pokazać się tabela `files`.

### 2. Backend (`http://127.0.0.1:3000`)

```
cd backend
cp .env.example .env
npm install
```
Otwórz `backend/.env` i uzupełnij dane dostępowe do bazy (`DB_USER`, `DB_PASSWORD`) — reszta wartości domyślnych zwykle nie wymaga zmiany:
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=<twoje hasło roota>
DB_NAME=secure_upload
MAX_FILE_SIZE_MB=5
```

Uruchomienie (najpierw odpala pełny zestaw testów z coverage — `predev` w `package.json` — dopiero potem startuje serwer; patrz [Testy i lint](#testy-i-lint)):
```
npm run dev
```

Sprawdzenie, że backend żyje i widzi bazę:
```
curl http://127.0.0.1:3000/api/health
```
Powinno zwrócić `{"status":"ok","db":"ok"}`. Jeśli `db` to `"error"` — sprawdź dane w `.env` i czy MySQL w ogóle działa.

### 3. Frontend (`http://localhost:5173`)

```
cd frontend
npm install
npm run dev
```
Otwórz w przeglądarce adres, który wypisze Vite (domyślnie `http://localhost:5173`).

## Testy i lint

Wymaga działającej bazy (testy czyszczą tabelę `files` i foldery uploadu przed każdym testem).
```
cd backend
npm test          # Jest + Supertest, obie wersje API, z coverage
npm run lint       # ESLint + eslint-plugin-security
```

## Scenariusze testowe (curl)

Ćwiczenia ze sprawozdania (rozdział 6) do samodzielnego powtórzenia. Komendy są dla **Git Bash** (Windows) lub zwykłego basha. Każdy scenariusz porównuje wersję podatną (BEFORE) z zabezpieczoną (AFTER). Wykonuj je na własnym, lokalnym środowisku.

### Przygotowanie

1. Uruchom bazę i backend (patrz wyżej): `cd backend && npm run dev`. Zostaw go działającego i **nie uruchamiaj w tym czasie `npm test`**, bo testy czyszczą tabelę `files` i foldery uploadu.
2. W drugim terminalu utwórz pliki testowe (trafiają do `~/upload-lab`, poza repozytorium):
```
bash scripts/prepare-test-files.sh
```
3. Wejdź do folderu z plikami:
```
cd ~/upload-lab
```

| Plik | Zawartość | Scenariusz |
|---|---|---|
| `normal.txt` | `hello` | 2, 6, 7, 8 |
| `shell.php.jpg` | tekst `<?php echo "hacked"; ?>` | 1 |
| `evil.svg` | SVG z `onload="alert(1)"` | 5 |
| `big.txt` | 6 MB zer | 4 |

### Scenariusz 1: podmiana rozszerzenia (Z1)

BEFORE (oczekiwane: `HTTP 201`):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@shell.php.jpg" http://127.0.0.1:3000/api/vulnerable/upload
```
AFTER (oczekiwane: `HTTP 415`, komunikat o niezgodnym typie pliku):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@shell.php.jpg" http://127.0.0.1:3000/api/secure/upload
```

### Scenariusz 2: path traversal w nazwie pliku (Z2)

Ustaw skrót do folderu backendu (podaj własną ścieżkę w formacie basha, np. `/e/.../secure-upload/backend`):
```
B="/sciezka/do/secure-upload/backend"
```
BEFORE: wysyłamy plik pod nazwą `../../pwned.txt` (oczekiwane: `HTTP 201`):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@normal.txt;filename=../../pwned.txt" http://127.0.0.1:3000/api/vulnerable/upload
```
Plik uciekł poza folder uploadu (oczekiwane: istnieje `pwned.txt` w głównym folderze backendu):
```
ls -la "$B/pwned.txt"
```
Sprzątanie przed testem AFTER:
```
rm "$B/pwned.txt"
```
AFTER: ten sam atak na wersję zabezpieczoną (oczekiwane: `HTTP 201`, w odpowiedzi nazwa `pwned.txt` bez ścieżki):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@normal.txt;filename=../../pwned.txt" http://127.0.0.1:3000/api/secure/upload
```
Plik nie powstał poza folderem uploadu (oczekiwane: `No such file or directory`):
```
ls -la "$B/pwned.txt"
```
Plik leży pod losową nazwą (oczekiwane: jeden plik `<uuid>.txt`):
```
ls -la "$B/uploads/secure"
```

### Scenariusz 3: SQL injection w pobieraniu i odczyt pliku (Z6)

Ładunek w identyfikatorze: `0 UNION SELECT 'x','text/plain','../schema.sql'` zakodowany w adresie URL:
```
U="0%20UNION%20SELECT%20'x'%2C'text%2Fplain'%2C'..%2Fschema.sql'"
```
BEFORE (oczekiwane: treść pliku `schema.sql` i `HTTP 200`):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user2" "http://127.0.0.1:3000/api/vulnerable/download/$U"
```
AFTER (oczekiwane: `{"error":"Nieprawidłowe ID"}` i `HTTP 400`):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user2" "http://127.0.0.1:3000/api/secure/download/$U"
```

### Scenariusz 4: za duży plik (Z3)

BEFORE (oczekiwane: `HTTP 201`, rozmiar `6291456`):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@big.txt" http://127.0.0.1:3000/api/vulnerable/upload
```
AFTER (oczekiwane: `{"error":"Plik jest za duży (limit 5 MB)"}` i `HTTP 413`):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@big.txt" http://127.0.0.1:3000/api/secure/upload
```

### Scenariusz 5: XSS przez plik SVG (Z4)

Wymaga przeglądarki (Chrome lub Edge). BEFORE: wgraj SVG do wersji podatnej (oczekiwane: `HTTP 201`, zapisz numer `id` z odpowiedzi):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@evil.svg" http://127.0.0.1:3000/api/vulnerable/upload
```
Otwórz plik w przeglądarce, podstawiając swój `id` (oczekiwane: okno `alert` z komunikatem `1`, czyli skrypt z SVG się wykonał):
```
http://127.0.0.1:3000/api/vulnerable/view/ID
```
AFTER: ten sam plik do wersji zabezpieczonej (oczekiwane: `HTTP 415`, komunikat o niedozwolonym typie pliku):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@evil.svg" http://127.0.0.1:3000/api/secure/upload
```

### Scenariusz 6: IDOR, cudzy plik przez ID (Z5)

Wykonywany w **panelu aplikacji** (`http://127.0.0.1:5173`), bez curl. Pliki do przesłania: `normal.txt` z `~/upload-lab`.

BEFORE (wersja **Podatna**):
1. Wybierz wersję **Podatna** i użytkownika **user1**, prześlij `normal.txt` (oczekiwane: `Przesłano „normal.txt” · ID … · HTTP 201`). Zapisz numer ID.
2. Zmień użytkownika na **user2**. Lista „Pliki wszystkich użytkowników” zawiera plik user1 (kolumna Właściciel: user1).
3. Kliknij **Pobierz** przy pliku user1 (oczekiwane: `Pobrano plik o ID … · HTTP 200`).

AFTER (wersja **Zabezpieczona**):
1. Wybierz wersję **Zabezpieczona** i użytkownika **user1**, prześlij `normal.txt` (oczekiwane: `HTTP 201`). Zapisz numer ID.
2. Zmień użytkownika na **user2**. Lista „Twoje pliki” jest pusta (0).
3. W polu „Sprawdź dostęp po ID” wpisz ID z kroku 1 i kliknij **Pobierz po ID** (oczekiwane: `Nie znaleziono pliku · HTTP 404`).

To samo w curl dla wersji zabezpieczonej (oczekiwane: `HTTP 404`), podstawiając ID pliku user1:
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user2" http://127.0.0.1:3000/api/secure/download/ID
```

### Scenariusz 7: SQL injection w nazwie pliku (Z6)

BEFORE: nazwa pliku z apostrofem psuje składnię zapytania SQL (oczekiwane: linia z `Error: You have an error in your SQL syntax` i `HTTP 500`; polecenie filtruje odpowiedź do tej linii i kodu HTTP):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@normal.txt;filename=test'.txt" http://127.0.0.1:3000/api/vulnerable/upload | grep -E "SQL syntax|^HTTP" | sed "s/&#39;/'/g"
```
AFTER: ta sama nazwa w wersji zabezpieczonej (oczekiwane: `HTTP 201`, w odpowiedzi `"name":"test'.txt"` zapisana jako zwykły tekst):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "file=@normal.txt;filename=test'.txt" http://127.0.0.1:3000/api/secure/upload
```
Uwaga: w wersji podatnej plik `test'.txt` zostaje na dysku (`backend/uploads/vulnerable/`), mimo że zapytanie SQL się nie powiodło. Sprzątanie: `npm test` czyści foldery uploadu i tabelę `files`.

### Scenariusz 8: wyciek informacji przy błędach (Z7)

Wysyłamy plik w polu o błędnej nazwie (`wrongfield` zamiast `file`). BEFORE (oczekiwane: linia `MulterError: Unexpected file field` ze stack trace i lokalnymi ścieżkami oraz `HTTP 500`; polecenie filtruje odpowiedź i obcina ją do 400 znaków):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "wrongfield=@normal.txt" http://127.0.0.1:3000/api/vulnerable/upload | grep -E "^<pre>|^HTTP" | sed -e "s/&#39;/'/g" -e 's/<br>/ /g' -e 's/&nbsp;/ /g' | cut -c1-400
```
AFTER (oczekiwane: `{"error":"Nieprawidłowe żądanie uploadu (jedno pole formularza: file, jeden plik)"}` i `HTTP 400`, bez stack trace):
```
curl -s -w "\nHTTP %{http_code}\n" -H "X-User: user1" -F "wrongfield=@normal.txt" http://127.0.0.1:3000/api/secure/upload
```

## Konta testowe

Bez prawdziwego logowania. Użytkownika wybiera nagłówek `X-User` (`user1` lub `user2`, domyślnie `user1`):
```
curl -H "X-User: user2" http://127.0.0.1:3000/api/secure/ping
```

## Uwaga

Serwer nasłuchuje tylko na `127.0.0.1`, bo wersja `vulnerable` jest naprawdę dziurawa. Nie zmieniaj na `0.0.0.0`.
