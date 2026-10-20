import request from 'supertest';
import { app } from '../src/app.js';
import { pool } from '../src/db.js';
import { pathExists, resetTestData } from './helpers.js';

const REAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const REAL_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REAL_GIF = Buffer.from('GIF89a', 'ascii');
const REAL_PDF = Buffer.from('%PDF-1.4', 'ascii');
const FAKE_PHP = Buffer.from('<?php echo "hacked"; ?>');
const SVG_XSS = Buffer.from('<svg onload="alert(1)"></svg>');
const HTML_AS_TXT = Buffer.from('<html><script>alert(1)</script></html>');
const PLAIN_TEXT = Buffer.from('hello world');
const SQLI_NAME = "a','x','x','x',1,'x');-- .txt";
const BIG_FILE = Buffer.alloc(6 * 1024 * 1024, 'a'); // 6 MB — powyżej limitu wersji secure (5 MB)

beforeEach(async () => {
  await resetTestData();
});

afterAll(async () => {
  await resetTestData();
});

describe.each(['vulnerable', 'secure'] as const)('wersja %s', (version) => {
  const base = `/api/${version}`;

  it('ping bez nagłówka X-User (domyślny użytkownik) działa', async () => {
    const res = await request(app).get(`${base}/ping`);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(version);
  });

  it('upload bez pliku zwraca 400', async () => {
    const res = await request(app).post(`${base}/upload`).set('X-User', 'user1');
    expect(res.status).toBe(400);
  });

  it('przyjmuje poprawny plik i zwraca 201', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', REAL_JPEG, 'photo.jpg');

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('photo.jpg');
  });

  it('nieznany użytkownik dostaje 401', async () => {
    const res = await request(app).post(`${base}/upload`).set('X-User', 'hacker').attach('file', PLAIN_TEXT, 'a.txt');
    expect(res.status).toBe(401);
  });

  it('scenariusz 1: podmiana rozszerzenia (shell.php.jpg)', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', FAKE_PHP, 'shell.php.jpg');

    if (version === 'vulnerable') {
      expect(res.status).toBe(201); // atak się udaje
    } else {
      expect(res.status).toBe(415); // zablokowane
    }
  });

  it('scenariusz 2: path traversal w nazwie pliku', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', PLAIN_TEXT, { filepath: '../../pwned.txt' } as unknown as { filename: string });

    expect(res.status).toBe(201);
    const escaped = await pathExists('pwned.txt');
    if (version === 'vulnerable') {
      expect(escaped).toBe(true); // plik uciekł poza folder uploadu
    } else {
      expect(escaped).toBe(false); // losowa nazwa (UUID) — nic nie wycieka
    }
  });

  it('scenariusz 3: za duży plik (6 MB)', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', BIG_FILE, 'big.txt');

    if (version === 'vulnerable') {
      expect(res.status).toBe(201); // brak limitu — atak się udaje
    } else {
      expect(res.status).toBe(413); // zablokowane, czysty JSON bez stack trace'u
      expect(res.body.error).toBeDefined();
    }
  }, 15000);

  it('scenariusz 4: SVG z XSS', async () => {
    const res = await request(app).post(`${base}/upload`).set('X-User', 'user1').attach('file', SVG_XSS, 'evil.svg');

    if (version === 'vulnerable') {
      expect(res.status).toBe(201);
    } else {
      expect(res.status).toBe(415);
    }
  });

  it('scenariusz 4b: HTML ze script pod rozszerzeniem .txt', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', HTML_AS_TXT, 'fake.txt');

    if (version === 'vulnerable') {
      expect(res.status).toBe(201);
    } else {
      expect(res.status).toBe(415);
    }
  });

  it('scenariusz 5: IDOR — pobranie cudzego pliku przez zgadnięcie ID', async () => {
    const upload = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', PLAIN_TEXT, 'moje.txt');
    const id = upload.body.id as number;

    const listAsUser2 = await request(app).get(`${base}/files`).set('X-User', 'user2');
    const downloadAsUser2 = await request(app).get(`${base}/download/${id}`).set('X-User', 'user2');

    if (version === 'vulnerable') {
      expect(listAsUser2.body.some((f: { id: number }) => f.id === id)).toBe(true);
      expect(downloadAsUser2.status).toBe(200); // atak się udaje
    } else {
      expect(listAsUser2.body.some((f: { id: number }) => f.id === id)).toBe(false);
      expect(downloadAsUser2.status).toBe(404); // zablokowane
    }

    const downloadAsOwner = await request(app).get(`${base}/download/${id}`).set('X-User', 'user1');
    expect(downloadAsOwner.status).toBe(200);
  });

  it('nieistniejące ID zwraca 404', async () => {
    const res = await request(app).get(`${base}/download/999999`).set('X-User', 'user1');
    expect(res.status).toBe(404);
  });

  it('scenariusz 6: SQL injection w nazwie pliku', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', PLAIN_TEXT, SQLI_NAME);

    if (version === 'vulnerable') {
      expect(res.status).toBe(500); // sklejany SQL — zapytanie się wysypuje
    } else {
      expect(res.status).toBe(201); // zapytanie parametryzowane — bezpieczne

      const list = await request(app).get(`${base}/files`).set('X-User', 'user1');
      expect(list.body.some((f: { original_name: string }) => f.original_name === SQLI_NAME)).toBe(true);
    }
  });

  it('scenariusz 2b: SQL injection w download → odczyt dowolnego pliku z dysku', async () => {
    const payload = encodeURIComponent("0 UNION SELECT 'x','text/plain','package.json'");
    const res = await request(app).get(`${base}/download/${payload}`).set('X-User', 'user2');

    if (version === 'vulnerable') {
      expect(res.status).toBe(200); // atak się udaje, serwer oddaje plik spoza uploads/
      expect(res.text).toContain('"name": "backend"');
    } else {
      expect(res.status).toBe(400); // ID musi być liczbą całkowitą
    }
  });

  it('scenariusz 4c: SVG ze skryptem serwowany inline (stored XSS)', async () => {
    const upload = await request(app).post(`${base}/upload`).set('X-User', 'user1').attach('file', SVG_XSS, 'evil.svg');

    if (version === 'vulnerable') {
      const view = await request(app).get(`${base}/view/${upload.body.id}`).set('X-User', 'user1');
      expect(view.status).toBe(200);
      expect(view.headers['content-type']).toContain('image/svg+xml'); // przeglądarka wykona skrypt z SVG
      expect(view.headers['content-disposition']).toBeUndefined();
      expect(view.headers['content-security-policy']).toBeUndefined();
      expect(Buffer.from(view.body).toString()).toContain('onload');
    } else {
      expect(upload.status).toBe(415); // SVG w ogóle nie trafia na dysk
    }
  });

  it('dodatkowy scenariusz: nieoczekiwany błąd uploadu (zła nazwa pola) — stack trace vs czysty JSON', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('wrongfield', PLAIN_TEXT, 'a.txt');

    if (version === 'vulnerable') {
      expect(res.status).toBe(500);
      expect(res.text).toContain('MulterError'); // wyciek szczegółów implementacji
    } else {
      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
      expect(res.text).not.toContain('MulterError');
    }
  });

  it('dodatkowy scenariusz: awaria bazy w trakcie uploadu — wyciek szczegółów vs czysty JSON', async () => {
    const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const query = jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('db-down-secret'));
    const res = await request(app).post(`${base}/upload`).set('X-User', 'user1').attach('file', PLAIN_TEXT, 'a.txt');
    query.mockRestore();
    errorLog.mockRestore();

    expect(res.status).toBe(500);
    if (version === 'vulnerable') {
      expect(res.text).toContain('db-down-secret'); // błąd wewnętrzny widoczny dla klienta
    } else {
      expect(res.body).toEqual({ error: 'Błąd serwera' });
      expect(res.text).not.toContain('db-down-secret');
    }
  });
});

describe('wersja vulnerable — podgląd inline', () => {
  it('nieistniejące ID w /view zwraca 404', async () => {
    const res = await request(app).get('/api/vulnerable/view/999999').set('X-User', 'user1');
    expect(res.status).toBe(404);
  });
});

describe('wersja secure — dodatkowe typy i walidacja ID', () => {
  const base = '/api/secure';

  it.each([
    ['png', REAL_PNG],
    ['gif', REAL_GIF],
    ['pdf', REAL_PDF],
  ])('przyjmuje poprawny plik .%s', async (ext, content) => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', content, `plik.${ext}`);
    expect(res.status).toBe(201);
  });

  it('nieprawidłowe (nienumeryczne) ID zwraca 400', async () => {
    const res = await request(app).get(`${base}/download/abc`).set('X-User', 'user1');
    expect(res.status).toBe(400);
  });

  it('dwa pliki w jednym żądaniu → 400 (limit liczby plików)', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', PLAIN_TEXT, 'a.txt')
      .attach('file', PLAIN_TEXT, 'b.txt');
    expect(res.status).toBe(400);
  });

  it('zbyt długa nazwa pliku (300 znaków) → 400, nie 500 z bazy', async () => {
    const res = await request(app)
      .post(`${base}/upload`)
      .set('X-User', 'user1')
      .attach('file', PLAIN_TEXT, `${'a'.repeat(300)}.txt`);
    expect(res.status).toBe(400);
  });

  it('rozszerzenie wielkimi literami nie obchodzi walidacji zawartości (.JPG z tekstem → 415)', async () => {
    const res = await request(app).post(`${base}/upload`).set('X-User', 'user1').attach('file', PLAIN_TEXT, 'foto.JPG');
    expect(res.status).toBe(415);
  });

  it('nagłówki ochronne na odpowiedziach (nosniff, CSP, brak X-Powered-By)', async () => {
    const res = await request(app).get(`${base}/files`).set('X-User', 'user1');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('download zawsze jako attachment (plik nie otwiera się inline)', async () => {
    const upload = await request(app).post(`${base}/upload`).set('X-User', 'user1').attach('file', PLAIN_TEXT, 'moje.txt');
    const res = await request(app).get(`${base}/download/${upload.body.id}`).set('X-User', 'user1');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});
