import { resolve, sep } from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '../db.js';

// VULNERABLE: wersja celowo podatna, każda dziura jest opisana w komentarzu.
export const router = Router();

const storage = multer.diskStorage({
  destination: 'uploads/vulnerable',
  // VULNERABLE: plik zapisujemy pod nazwą od klienta, bez losowania i bez czyszczenia (nadpisywanie plików, nazwy typu shell.php.jpg).
  filename: (_req, file, cb) => cb(null, file.originalname),
});

// VULNERABLE: brak limitu rozmiaru i brak filtra typu pliku. preservePath zostawia ścieżkę z nazwy (path traversal, np. ../../x).
const upload = multer({ storage, preservePath: true });

router.get('/ping', (_req, res) => {
  res.json({ version: 'vulnerable' });
});

router.post('/upload', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: 'Brak pliku (pole formularza: file)' });
    return;
  }

  // VULNERABLE: typ pliku bierzemy z nagłówka od klienta, zawartości nie sprawdzamy.
  const mime = file.mimetype;
  const path = file.path.split(sep).join('/');

  // VULNERABLE: SQL sklejany stringiem, nazwa pliku trafia do zapytania bez parametryzacji (SQL injection).
  const sql =
    'INSERT INTO files (version, owner, original_name, stored_name, mime_type, size, path) VALUES (' +
    `'vulnerable', '${res.locals.user}', '${file.originalname}', '${file.filename}', '${mime}', ${file.size}, '${path}')`;
  const [result] = await pool.query<ResultSetHeader>(sql);

  res.status(201).json({
    id: result.insertId,
    name: file.originalname,
    path,
    size: file.size,
    type: mime,
  });
});

// VULNERABLE: lista zwraca pliki wszystkich użytkowników, nie tylko tego, który pyta.
router.get('/files', async (_req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, owner, original_name, mime_type, size, created_at FROM files WHERE version = 'vulnerable' ORDER BY id DESC",
  );
  res.json(rows);
});

// VULNERABLE: brak kontroli właściciela (IDOR) i id sklejane wprost w zapytaniu zamiast przez placeholder.
router.get('/download/:id', async (req, res) => {
  const sql = `SELECT original_name, mime_type, path FROM files WHERE version = 'vulnerable' AND id = ${req.params.id}`;
  const [rows] = await pool.query<RowDataPacket[]>(sql);
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: 'Nie znaleziono pliku' });
    return;
  }

  res.download(row.path, row.original_name);
});

// VULNERABLE: plik serwowany "inline" (bez Content-Disposition: attachment, bez nosniff i CSP), typ wynika z rozszerzenia nazwy od klienta.
// SVG/HTML wykonuje wtedy skrypt w origin aplikacji (stored XSS). Brak też kontroli właściciela (IDOR).
router.get('/view/:id', async (req, res) => {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT path FROM files WHERE version = 'vulnerable' AND id = ?",
    [req.params.id],
  );
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: 'Nie znaleziono pliku' });
    return;
  }

  res.sendFile(resolve(row.path));
});
