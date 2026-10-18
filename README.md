# Secure Upload

Projekt P6: bezpieczne przesyłanie plików. Jedna aplikacja, dwie wersje uploadu: `vulnerable` (celowo podatna) i `secure` (zabezpieczona). Szczegóły w [docs/](docs/).

## Wymagania

- Node.js 20+ (testowane na 25)
- MySQL 8

## Uruchomienie

1. **Baza.** Zaimportuj strukturę (tworzy bazę `secure_upload` i tabelę `files`):
   ```
   mysql -u root -p < schema.sql
   ```
2. **Backend** (`http://127.0.0.1:3000`):
   ```
   cd backend
   cp .env.example .env    # uzupełnij DB_USER / DB_PASSWORD
   npm install
   npm run dev
   ```
3. **Frontend** (`http://localhost:5173`):
   ```
   cd frontend
   npm install
   npm run dev
   ```

Sprawdzenie: `curl http://127.0.0.1:3000/api/health` powinno zwrócić `{"status":"ok","db":"ok"}`.

## Konta testowe

Bez prawdziwego logowania. Użytkownika wybiera nagłówek `X-User` (`user1` lub `user2`, domyślnie `user1`):
```
curl -H "X-User: user2" http://127.0.0.1:3000/api/secure/ping
```

## Uwaga

Serwer nasłuchuje tylko na `127.0.0.1`, bo wersja `vulnerable` jest naprawdę dziurawa. Nie zmieniaj na `0.0.0.0`.
