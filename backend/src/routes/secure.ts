import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import type { NextFunction, Request, Response } from 'express';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db.js';

// SECURE: wersja zabezpieczona, każda ochrona jest opisana w komentarzu.
export const router = Router();

// SECURE: nagłówki ochronne na każdej odpowiedzi — nosniff (przeglądarka nie zgaduje typu pliku) i CSP bez skryptów (sandbox),
// dodatkowo bez X-Powered-By (nie zdradzamy technologii serwera).
router.use((_req, res, next) => {
  res.removeHeader('X-Powered-By');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  next();
});

// SECURE: limit rozmiaru konfigurowalny przez .env (domyślnie 5 MB), zamiast sztywnej wartości w kodzie.
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB ?? 5);
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const MAX_NAME_LENGTH = 255;

// SECURE: plik trzymamy w pamięci, dopóki nie sprawdzimy jego zawartości — nic nie trafia na dysk bez walidacji.
// Limity: rozmiar pliku i liczba plików na żądanie (jeden).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_SIZE, files: 1 } });

const isJpeg = (b: Buffer) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

// SECURE: dozwolone typy rozpoznawane po realnej zawartości (magic bytes), nie po rozszerzeniu czy nagłówku od klienta.
// Blokuje to m.in. SVG/HTML (mogą zawierać JS) i pliki wykonywalne podszywające się pod obrazek.
const SIGNATURES: { ext: string; mime: string; check: (buf: Buffer) => boolean }[] = [
  { ext: 'jpg', mime: 'image/jpeg', check: isJpeg },
  { ext: 'jpeg', mime: 'image/jpeg', check: isJpeg },
  {
    ext: 'png',
    mime: 'image/png',
    check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    ext: 'gif',
    mime: 'image/gif',
    check: (b) =>
      b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  },
  {
    ext: 'pdf',
    mime: 'application/pdf',
    check: (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
  },
  {
    ext: 'txt',
    mime: 'text/plain',
    check: (b) => !b.includes(0) && b.subarray(0, 256).toString('utf-8').trimStart()[0] !== '<',
  },
];

function detectSignature(name: string, buffer: Buffer) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const signature = SIGNATURES.find((s) => s.ext === ext);
  if (!signature || !signature.check(buffer)) return null;
  return signature;
}

router.get('/ping', (_req, res) => {
  res.json({ version: 'secure' });
});

router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Brak pliku (pole formularza: file)' });
    return;
  }

  // SECURE: nazwa dłuższa niż kolumna w bazie jest odrzucana wprost (400), zamiast kończyć się błędem bazy (500).
  if (file.originalname.length > MAX_NAME_LENGTH) {
    res.status(400).json({ error: `Nazwa pliku jest za długa (limit ${MAX_NAME_LENGTH} znaków)` });
    return;
  }

  // SECURE: rozszerzenie z nazwy pliku jest tylko wskazówką — decyduje dopasowanie do zawartości (magic bytes).
  const signature = detectSignature(file.originalname, file.buffer);
  if (!signature) {
    res.status(415).json({ error: 'Niedozwolony lub niezgodny z zawartością typ pliku' });
    return;
  }

  // SECURE: losowa nazwa pliku na dysku — oryginalna nazwa (ewentualny path traversal) nigdy nie trafia do ścieżki.
  const storedName = `${randomUUID()}.${signature.ext}`;
  const path = `uploads/secure/${storedName}`;
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  await writeFile(path, file.buffer);

  const owner = res.locals.user as string;
  // SECURE: zapytanie parametryzowane, dane użytkownika nie są sklejane do SQL-a.
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO files (version, owner, original_name, stored_name, mime_type, size, path) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['secure', owner, file.originalname, storedName, signature.mime, file.size, path],
  );

  res.status(201).json({
    id: result.insertId,
    name: file.originalname,
    size: file.size,
    type: signature.mime,
  });
});

// SECURE: lista zwraca tylko pliki zalogowanego (nagłówek X-User) użytkownika.
router.get('/files', async (_req, res) => {
  const owner = res.locals.user as string;
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT id, original_name, mime_type, size, created_at FROM files WHERE version = ? AND owner = ? ORDER BY id DESC',
    ['secure', owner],
  );
  res.json(rows);
});

// SECURE: kontrola właściciela w samym zapytaniu — cudzy plik (nawet przy trafionym ID) zwraca 404, nie 403,
// żeby nie zdradzać, czy plik o danym ID w ogóle istnieje.
router.get('/download/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Nieprawidłowe ID' });
    return;
  }

  const owner = res.locals.user as string;
  const [rows] = await pool.query<RowDataPacket[]>(
    'SELECT original_name, mime_type, path FROM files WHERE version = ? AND id = ? AND owner = ?',
    ['secure', id, owner],
  );
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: 'Nie znaleziono pliku' });
    return;
  }

  res.download(row.path, row.original_name);
});

// SECURE: własny error handler — błąd Multera (za duży plik, zła nazwa pola, więcej niż jeden plik) albo inny wyjątek
// wraca jako czysty JSON z właściwym kodem, zamiast domyślnej strony Expressa ze stack trace'em (wyciek szczegółów implementacji).
router.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({ error: `Plik jest za duży (limit ${MAX_FILE_SIZE_MB} MB)` });
      return;
    }
    res.status(400).json({ error: 'Nieprawidłowe żądanie uploadu (jedno pole formularza: file, jeden plik)' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Błąd serwera' });
});
