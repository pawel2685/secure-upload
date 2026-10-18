import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import './App.css';
type Mode = 'secure' | 'vulnerable';
type User = 'user1' | 'user2';
type FileRow = {
    id: number;
    original_name: string;
    mime_type: string;
    size: number;
    created_at: string;
    owner?: string;
};
type Entry = {
    id: number;
    time: string;
    mode: Mode;
    user: User;
    action: string;
    status: number | null;
};
const labels = { secure: 'Zabezpieczona', vulnerable: 'Podatna' };
const sizeLabel = (n: number) => n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`;
function Icon({ kind = 'shield' }: {
    kind?: 'shield' | 'upload' | 'file' | 'download';
}) {
    const paths = { shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6ZM8 12l3 3 5-6', upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6', file: 'M14 3H5v18h14V8ZM14 3v6h5M8 13h8M8 17h5', download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4' };
    return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
async function errorText(response: Response) {
    if (response.headers.get('content-type')?.includes('application/json')) {
        const body = await response.json().catch(() => null);
        if (typeof body?.error === 'string')
            return body.error;
    }
    return response.status === 404 ? 'Nie znaleziono pliku lub nie masz do niego dostępu.' : `Żądanie nie powiodło się (HTTP ${response.status}).`;
}
function App() {
    const [mode, setMode] = useState<Mode>('secure');
    const [user, setUser] = useState<User>('user1');
    const [history, setHistory] = useState<Entry[]>([]);
    const [health, setHealth] = useState({ api: 'Sprawdzanie', db: 'Sprawdzanie' });
    const record = useCallback((mode: Mode, user: User, action: string, status: number | null) => {
        setHistory(items => [{ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString('pl-PL'), mode, user, action, status }, ...items].slice(0, 30));
    }, []);
    useEffect(() => {
        const controller = new AbortController();
        const check = async () => {
            try {
                const response = await fetch('/api/health', { signal: controller.signal });
                const body = await response.json();
                if (!controller.signal.aborted)
                    setHealth({ api: body.status === 'ok' ? 'Online' : 'Błąd', db: body.db === 'ok' ? 'Online' : 'Błąd' });
            }
            catch {
                if (!controller.signal.aborted)
                    setHealth({ api: 'Offline', db: 'Brak danych' });
            }
        };
        void check();
        const interval = window.setInterval(() => void check(), 15000);
        return () => { controller.abort(); window.clearInterval(interval); };
    }, []);
    return <div className={`app ${mode}`}>
    <header className="topbar"><div className="brand"><span className="brand-icon"><Icon /></span>Secure Upload <span className="brand-lab">/ LAB</span></div><div className="connection">{Object.entries(health).map(([key, value]) => <span key={key}><i className={value === 'Online' ? 'dot online' : 'dot'}/>{key === 'api' ? 'API' : 'MySQL'} <b>{value}</b></span>)}</div></header>
    <main><div className="intro"><div><p className="eyebrow">LABORATORIUM BEZPIECZEŃSTWA APLIKACJI</p><h1>Bezpieczne przesyłanie plików (Secure Upload)</h1><p className="intro-copy">Prześlij, porównaj i zobacz, jak zabezpieczenia zmieniają wynik.</p></div><span className="project-tag">PROJEKT P6 <span>↗</span></span></div>
      <Workspace key={`${mode}-${user}`} mode={mode} user={user} setMode={setMode} setUser={setUser} record={record}/>
      <section className="card history"><div className="section-heading"><div><p className="eyebrow">ŚLAD EKSPERYMENTU</p><h2>Historia operacji</h2></div><button className="text-button" onClick={() => setHistory([])} disabled={!history.length}>Wyczyść historię</button></div>
        {history.length ? <div className="table-scroll"><table><thead><tr><th>Czas</th><th>Operacja</th><th>Wersja</th><th>Użytkownik</th><th>Wynik</th></tr></thead><tbody>{history.map(entry => <tr key={entry.id}><td className="mono">{entry.time}</td><td>{entry.action}</td><td><span className={`badge ${entry.mode}`}>{labels[entry.mode]}</span></td><td>{entry.user}</td><td><span className={`http ${entry.status !== null && entry.status < 400 ? 'success' : 'failure'}`}>{entry.status === null ? 'Błąd sieci' : `HTTP ${entry.status}`}</span></td></tr>)}</tbody></table></div> : <p className="empty-history">Operacje pojawią się tutaj. Historia znika po odświeżeniu strony.</p>}
      </section><footer><span>Secure Upload Lab / React + Express + MySQL</span><span>Środowisko lokalne · użytkownicy testowi</span></footer>
    </main></div>;
}
function Workspace({ mode, user, setMode, setUser, record }: {
    mode: Mode;
    user: User;
    setMode: (mode: Mode) => void;
    setUser: (user: User) => void;
    record: (mode: Mode, user: User, action: string, status: number | null) => void;
}) {
    const secure = mode === 'secure';
    const [file, setFile] = useState<File | null>(null);
    const [files, setFiles] = useState<FileRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [listError, setListError] = useState('');
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [notice, setNotice] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    const [downloadId, setDownloadId] = useState('');
    const input = useRef<HTMLInputElement>(null);
    const listController = useRef<AbortController | null>(null);
    const base = `/api/${mode}`;
    const refresh = useCallback(async () => {
        listController.current?.abort();
        const controller = new AbortController();
        listController.current = controller;
        let status: number | null = null;
        try {
            const response = await fetch(`${base}/files`, { headers: { 'X-User': user }, signal: controller.signal });
            status = response.status;
            if (!response.ok)
                throw new Error(await errorText(response));
            const data: FileRow[] = await response.json();
            if (!Array.isArray(data))
                throw new Error('Nieprawidłowa odpowiedź listy plików.');
            if (!controller.signal.aborted) {
                setFiles(data);
                setListError('');
            }
        }
        catch (error) {
            if (!controller.signal.aborted) {
                setFiles([]);
                setListError(error instanceof Error ? error.message : 'Nie można pobrać listy.');
            }
        }
        finally {
            if (!controller.signal.aborted) {
                setLoading(false);
                record(mode, user, 'Lista plików', status);
            }
        }
    }, [base, mode, user, record]);
    // refresh updates state only after the network request; initial loading is set by useState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { void refresh(); return () => listController.current?.abort(); }, [refresh]);
    async function upload(event: FormEvent) {
        event.preventDefault();
        if (!file || busy)
            return;
        setBusy(true);
        setNotice(null);
        let status: number | null = null;
        try {
            const form = new FormData();
            form.append('file', file);
            const response = await fetch(`${base}/upload`, { method: 'POST', headers: { 'X-User': user }, body: form });
            status = response.status;
            if (!response.ok)
                throw new Error(await errorText(response));
            const data = await response.json();
            setNotice({ ok: true, text: `Przesłano „${data.name}” · ID ${data.id} · HTTP ${status}` });
            setFile(null);
            if (input.current)
                input.current.value = '';
            await refresh();
        }
        catch (error) {
            setNotice({ ok: false, text: `${error instanceof Error ? error.message : 'Nie udało się przesłać pliku.'}${status ? ` · HTTP ${status}` : ' · Sprawdź połączenie z backendem.'}` });
        }
        finally {
            record(mode, user, `Upload: ${file.name}`, status);
            setBusy(false);
        }
    }
    async function download(id: string, name?: string) {
        if (busy)
            return;
        setBusy(true);
        setNotice(null);
        let status: number | null = null;
        try {
            const response = await fetch(`${base}/download/${encodeURIComponent(id)}`, { headers: { 'X-User': user } });
            status = response.status;
            if (!response.ok)
                throw new Error(await errorText(response));
            const blob = await response.blob();
            const disposition = response.headers.get('content-disposition') ?? '';
            const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
            let filename = name ?? disposition.match(/filename="([^"]+)"/i)?.[1] ?? `plik-${id}`;
            if (!name && encoded) {
                try {
                    filename = decodeURIComponent(encoded);
                }
                catch { /* Keep fallback. */ }
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename.replace(/[\\/]/g, '_');
            document.body.append(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
            setNotice({ ok: true, text: `Pobrano plik o ID ${id} · HTTP ${status}` });
        }
        catch (error) {
            setNotice({ ok: false, text: `${error instanceof Error ? error.message : 'Nie udało się pobrać pliku.'}${status ? ` · HTTP ${status}` : ' · Sprawdź połączenie z backendem.'}` });
        }
        finally {
            record(mode, user, `Pobranie ID ${id}`, status);
            setBusy(false);
        }
    }
    const rules = secure ? [['Weryfikacja zawartości', 'JPG, PNG, GIF, PDF i TXT'], ['Limit wielkości pliku', 'Domyślnie 5 MB · ustawiany w backendzie'], ['Losowa nazwa na dysku', 'UUID zamiast nazwy od użytkownika'], ['Kontrola właściciela', 'Lista i pobieranie tylko własnych plików'], ['Zapytania parametryzowane', 'Dane pliku oddzielone od kodu SQL']] : [['Brak weryfikacji zawartości', 'Typ pliku pochodzi od klienta'], ['Brak limitu uploadu', 'Serwer przyjmuje także duże pliki'], ['Oryginalna nazwa na dysku', 'Możliwość nadpisania i path traversal'], ['Brak kontroli właściciela', 'Widoczne pliki wszystkich użytkowników'], ['SQL sklejany z danych', 'Nazwa pliku wpływa na zapytanie']];
    return <>
    <section className="controls" aria-label="Konfiguracja eksperymentu"><div><span className="control-label">01 / WYBIERZ WERSJĘ BACKENDU</span><div className="segmented" aria-label="Wersja backendu">{(['vulnerable', 'secure'] as const).map(value => <button key={value} className={mode === value ? 'selected' : ''} aria-pressed={mode === value} disabled={busy} onClick={() => setMode(value)}>{value === 'secure' ? <Icon /> : <span aria-hidden="true">△</span>}{labels[value]}</button>)}</div></div><div className="user-control"><label htmlFor="user">UŻYTKOWNIK TESTOWY</label><select id="user" value={user} disabled={busy} onChange={event => setUser(event.target.value as User)}><option value="user1">user1</option><option value="user2">user2</option></select></div></section>
    <div className="mode-banner"><Icon /><p>{secure ? <><strong>Ochrona aktywna.</strong> Backend weryfikuje pliki i dostęp do nich.</> : <><strong>Tryb celowo podatny.</strong> Służy do lokalnej demonstracji błędów bezpieczeństwa.</>}</p><span className="mono">/api/{mode}</span></div>
    <div className="workspace-grid"><section className="card upload-card"><div className="section-heading"><div><p className="eyebrow">02 / PRZEŚLIJ PLIK</p><h2>Sprawdź, co przejdzie.</h2></div><span className="step-icon"><Icon kind="upload"/></span></div><form onSubmit={upload}>
      <div className={`dropzone ${dragging ? 'dragging' : ''}`} onDragOver={event => { event.preventDefault(); if (!busy)
        setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); if (!busy && event.dataTransfer.files[0]) {
        setFile(event.dataTransfer.files[0]);
        setNotice(null);
    } }}><span className="upload-symbol"><Icon kind={file ? 'file' : 'upload'}/></span><strong>{file ? file.name : 'Przeciągnij plik tutaj'}</strong><p>{file ? sizeLabel(file.size) : 'lub wybierz go z dysku komputera'}</p><button type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}>{file ? 'Zmień plik' : 'Wybierz plik'}</button><input ref={input} className="sr-only" tabIndex={-1} type="file" aria-label="Wybierz plik do przesłania" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setNotice(null); }}/></div>
      <div className="upload-bottom"><span>Jeden plik na żądanie.<br />Walidację wykonuje serwer.</span><button className="primary" disabled={!file || busy} type="submit"><Icon kind="upload"/>{busy ? 'Trwa operacja…' : 'Prześlij plik'}</button></div>
    </form></section><aside className="card rules"><p className="eyebrow">CO ZMIENIA TEN TRYB?</p><h2>{secure ? 'Zabezpieczenia' : 'Celowe podatności'}</h2><ul>{rules.map(([title, description]) => <li key={title}><span className="rule-check">{secure ? '✓' : '!'}</span><div><strong>{title}</strong><p>{description}</p></div></li>)}</ul><p className="rules-note">Zabezpieczenia w zakresie demonstracji. Nagłówek X-User symuluje użytkownika — nie jest prawdziwym logowaniem.</p></aside></div>
    <div aria-live="polite" aria-atomic="true">{notice && <div className={`notice ${notice.ok ? 'success' : 'failure'}`} role={notice.ok ? 'status' : 'alert'}><span>{notice.ok ? '✓' : '!'} {notice.text}</span><button aria-label="Zamknij komunikat" onClick={() => setNotice(null)}>×</button></div>}</div>
    <section className="card files"><div className="section-heading"><div><p className="eyebrow">03 / ZOBACZ WYNIK</p><h2>{secure ? 'Twoje pliki' : 'Pliki wszystkich użytkowników'} <span className="count">{files.length}</span></h2></div><button className="secondary" disabled={loading || busy} onClick={() => { setLoading(true); setListError(''); void refresh(); }}>↻ Odśwież</button></div>
      {loading ? <div className="empty-state" role="status">Wczytywanie listy plików…</div> : listError ? <div className="empty-state failure" role="alert">{listError} Użyj „Odśwież”, aby spróbować ponownie.</div> : files.length ? <div className="table-scroll"><table><thead><tr><th>Nazwa / ID</th>{!secure && <th>Właściciel</th>}<th>Typ</th><th>Rozmiar</th><th>Dodano</th><th><span className="sr-only">Akcja</span></th></tr></thead><tbody>{files.map(row => <tr key={row.id}><td><div className="file-name"><Icon kind="file"/><span><strong>{row.original_name}</strong><small>ID {row.id}</small></span></div></td>{!secure && <td>{row.owner}</td>}<td className="mime">{row.mime_type}</td><td className="nowrap">{sizeLabel(row.size)}</td><td className="nowrap">{new Date(row.created_at).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' })}</td><td><button className="text-button" disabled={busy} onClick={() => void download(String(row.id), row.original_name)}><Icon kind="download"/>Pobierz</button></td></tr>)}</tbody></table></div> : <div className="empty-state"><Icon kind="file"/><strong>Jeszcze nie ma tu plików</strong><p>Prześlij pierwszy plik jako {user} w wersji „{labels[mode]}”.</p></div>}
      <div className="download-test"><div><strong>Sprawdź dostęp po ID</strong><p>Zmień użytkownika i spróbuj pobrać jego poprzedni plik.</p></div><form onSubmit={event => { event.preventDefault(); if (downloadId.trim())
        void download(downloadId.trim()); }}><label className="sr-only" htmlFor="download-id">ID pliku</label><input id="download-id" placeholder="ID pliku, np. 12" value={downloadId} disabled={busy} onChange={event => setDownloadId(event.target.value)} required/><button className="secondary" disabled={busy || !downloadId.trim()}>Pobierz po ID ↗</button></form></div>
    </section>
  </>;
}
export default App;
