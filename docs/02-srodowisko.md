# 2. Środowisko

## Technologie

| Warstwa | Technologie |
|---|---|
| Frontend | React 19, Vite, TypeScript, ESLint |
| Backend | Node.js, Express 5, TypeScript, Multer (obsługa uploadu), mysql2, tsx (uruchamianie w trybie dev) |
| Baza danych | MySQL (metadane plików: właściciel, nazwa, typ, rozmiar, ścieżka) |
| Testy i narzędzia | Jest + Supertest, Burp Suite, curl |

## Architektura

Aplikacja to klasyczny podział klient–serwer. Frontend (`localhost:5173`) komunikuje się z backendem przez REST API (`127.0.0.1:3000`), a backend zapisuje pliki na dysku i ich metadane w MySQL. Backend nasłuchuje wyłącznie na `127.0.0.1`, bo wersja podatna jest celowo dziurawa i nie może być dostępna z sieci.

Cały pomysł opiera się na jednej aplikacji z dwiema wersjami logiki uploadu, wystawionymi pod osobnymi ścieżkami:

- `/api/vulnerable/...` – wersja celowo podatna (bez walidacji, oryginalne nazwy plików, SQL sklejany stringiem),
- `/api/secure/...` – wersja zabezpieczona (walidacja zawartości, losowe nazwy, limity, zapytania parametryzowane, kontrola właściciela).

Dzięki temu te same ataki i testy można puścić na obu wersjach i porównać wyniki.

## Struktura projektu

```text
secure-upload/
├── docs/        dokumentacja do sprawozdania
├── frontend/    aplikacja React
├── backend/     serwer Express
├── schema.sql   struktura bazy MySQL
└── README.md    instrukcja uruchomienia
```

Stan na koniec etapu 2 (szkielet i baza):

- `backend/src/server.ts` – punkt wejścia: Express, CORS, parsowanie JSON, podpięcie routerów pod `/api/vulnerable` i `/api/secure` oraz `GET /api/health`, który sprawdza też połączenie z bazą (`{ "status": "ok", "db": "ok" }`). Przy starcie tworzy foldery `uploads/vulnerable` i `uploads/secure`.
- `backend/src/db.ts` – pula połączeń mysql2, dane dostępowe z pliku `.env`.
- `backend/src/user.ts` – dwa konta testowe (`user1`, `user2`) wpisane na sztywno, wybierane nagłówkiem `X-User`. Zamiast prawdziwego logowania, które jest poza zakresem projektu.
- `backend/src/routes/vulnerable.ts`, `secure.ts` – dwa routery, na razie szkielety z `/ping`. Tu trafi logika obu wersji uploadu.
- `schema.sql` – baza `secure_upload` i tabela `files` (właściciel, oryginalna i zapisana nazwa, typ, rozmiar, ścieżka, wersja).
- `backend/package.json`, `tsconfig.json` – zależności, skrypt `npm run dev` i konfiguracja TypeScripta (`strict`, moduły ES).
- `frontend/src/` – szablon Vite, bez własnej logiki. Zostanie zastąpiony formularzem uploadu i listą plików.
- `frontend/eslint.config.js` – konfiguracja ESLinta.
- `README.md` – instrukcja uruchomienia, `.gitignore` – wyklucza m.in. `node_modules/`, `.env` i `backend/uploads/`.

Pliki `tests/` powstaną w kolejnych etapach i zostaną opisane po ich zamknięciu.
