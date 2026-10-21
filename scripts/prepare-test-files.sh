#!/usr/bin/env bash
# Tworzy pliki testowe do scenariuszy z README (sekcja "Scenariusze testowe") w folderze poza repozytorium.
# Zawartość jest nieszkodliwa: tekst udający skrypt PHP, SVG z alert(1) i plik 6 MB wypełniony zerami.
# Użycie: bash scripts/prepare-test-files.sh [folder]   (domyślnie ~/upload-lab)
set -euo pipefail

DIR="${1:-$HOME/upload-lab}"
mkdir -p "$DIR"

echo "hello" > "$DIR/normal.txt"
printf '<?php echo "hacked"; ?>' > "$DIR/shell.php.jpg"
printf '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>' > "$DIR/evil.svg"
head -c 6291456 /dev/zero > "$DIR/big.txt"

echo "Gotowe: $DIR"
ls -la "$DIR"
