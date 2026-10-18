# 7. Formularz (frontend)

Frontend React + TypeScript działa pod `http://127.0.0.1:5173`. W katalogu `frontend` uruchom `npm run dev`; backend i MySQL muszą działać. Vite przekazuje żądania `/api` do `http://127.0.0.1:3000`. Serwery nasłuchują wyłącznie lokalnie.

## Obsługa panelu

Domyślnie aktywna jest wersja **Zabezpieczona**. Przełącznik **Podatna / Zabezpieczona** zmienia prefiks API (`/api/vulnerable` lub `/api/secure`), opis zabezpieczeń i listę plików. Zmiana wersji lub użytkownika czyści wybrany plik i komunikat poprzedniej operacji. Podczas przesyłania i pobierania wybór wersji oraz użytkownika jest zablokowany.

Wybierz `user1` lub `user2`, wskaż plik przyciskiem albo przeciągnij go na formularz i kliknij **Prześlij plik**. Formularz wysyła `multipart/form-data` z polem `file`. Przeglądarka nie blokuje typów ani rozmiarów plików testowych; walidację wykonuje backend. Limit w wersji secure wynosi domyślnie 5 MB i zależy od `MAX_FILE_SIZE_MB` w backendzie.

Lista pokazuje nazwę, ID, typ, rozmiar i datę. W wersji podatnej obejmuje wszystkich użytkowników i dodatkowo pokazuje właściciela. Każde żądanie, także pobranie przez `fetch` i `Blob`, przesyła nagłówek `X-User`. Jest to symulacja użytkownika, nie rzeczywiste logowanie.

Pole **Sprawdź dostęp po ID** pozwala wpisać ID pliku drugiego użytkownika. Historia zachowuje ostatnie 30 operacji wraz z wersją, użytkownikiem i faktycznym kodem HTTP; znika po odświeżeniu strony. Błędy sieci są odróżniane od odpowiedzi HTTP. Status API i MySQL odświeża się co 15 sekund.

## Krótka demonstracja

1. W wersji zabezpieczonej jako `user1` prześlij `frontend/test-fixtures/demo.txt` i zapamiętaj ID. Właściciel może pobrać plik (`200`).
2. Wybierz `user2`: plik znika z listy. Próba pobrania po zapamiętanym ID zwraca `404`.
3. Prześlij `frontend/test-fixtures/niezgodny.jpg` (tekst z rozszerzeniem obrazu): secure zwraca `415`.
4. Wybierz wersję podatną i powtórz upload tego pliku: backend akceptuje go. Obie wersje mają oddzielne listy plików.

Zweryfikowano w przeglądarce: przełączanie wersji, upload TXT (`201`), pobieranie przez właściciela (`200`), odmowę dla drugiego użytkownika (`404`) i odrzucenie niezgodnego JPG (`415`). Kompilacja TypeScript, build Vite i ESLint przechodzą.

> **[ZRZUT EKRANU DO DODANIA: panel w trybie zabezpieczonym z listą plików oraz historią odpowiedzi 201, 200, 404 i 415]**
