# 1. Wstęp

## 1.1 Cel projektu

Celem projektu jest zbadanie typowych podatności mechanizmu przesyłania plików, wykazanie ich w aplikacji celowo podatnej oraz usunięcie w wersji zabezpieczonej. Skuteczność poprawek potwierdzono testem ponownym (retest): ten sam zestaw testów uruchomiono na obu wersjach i porównano wyniki (BEFORE → AFTER). Praca obejmuje pełny cykl bezpieczeństwa aplikacji: zrozumieć, znaleźć, ocenić, naprawić i zweryfikować.

## 1.2 Problem

Przesyłanie plików (temat P6, *Secure Upload*) należy do najbardziej ryzykownych funkcji aplikacji webowych. Serwer przyjmuje dane, nad którymi nie ma kontroli: nazwę, deklarowany typ i zawartość pliku. Jeżeli im zaufa, atakujący może wgrać plik wykonywalny pod niewinnym rozszerzeniem, zapisać go poza katalogiem uploadu (path traversal), odczytać cudzy plik albo przekazać do bazy złośliwe zapytanie SQL ukryte w nazwie pliku. Projekt pokazuje te ataki w praktyce i ich blokadę.

## 1.3 Zakres

| W zakresie | Poza zakresem |
|---|---|
| aplikacja uruchomiona lokalnie (`localhost`) | wszystko poza komputerem zespołu |
| frontend (React) i backend (Express), endpointy upload / download / lista plików | testy obciążeniowe i DoS |
| lokalna baza MySQL | prawdziwe logowanie i rejestracja |
| dwa konta testowe (`user1`, `user2`) wpisane na sztywno | wdrożenie na serwer |
| własne pliki testowe, obie wersje aplikacji (podatna i zabezpieczona) | |

## 1.4 Deklaracja zakresu i etyki

Wszystkie testy wykonano wyłącznie w lokalnym środowisku laboratoryjnym, na własnej aplikacji i danych syntetycznych. Serwer nasłuchuje tylko na `127.0.0.1`, ponieważ wersja podatna jest celowo dziurawa. Pliki testowe zawierają wyłącznie bezpieczne ładunki demonstracyjne (np. `alert(1)`, tekst zamiast skryptu PHP). W materiale dowodowym nie ma haseł, tokenów ani danych osobowych.

## 1.5 Zespół

| Osoba | Rola | Wkład |
|---|---|---|
| Paweł [nazwisko] | backend i bezpieczeństwo | [do uzupełnienia: wersje podatna i zabezpieczona, baza, testy, dokumentacja] |
| Jakub Kuszper | frontend | [do uzupełnienia: formularz React do uploadu] |

## 1.6 Układ sprawozdania

Rozdział 2 opisuje środowisko, rozdział 3 model zagrożeń i ocenę ryzyka z odniesieniem do standardów (OWASP ASVS 5.0.0, WSTG 4.2, Top 10:2025). Rozdziały 4 i 5 przedstawiają mechanizm wersji podatnej i zabezpieczonej, rozdział 6 wyniki testów, rozdział 7 formularz, a rozdział 8 wnioski.
