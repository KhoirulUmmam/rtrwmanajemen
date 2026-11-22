// Akses Google Sheets lewat Google Apps Script (DIPAKAI DI SERVER SAJA).
// Semua request membawa GAS_SECRET agar Web App tidak bisa dipakai sembarang orang.

export type SheetName =
  | 'Residents'
  | 'Announcements'
  | 'Letters'
  | 'Transactions'
  | 'Reports'
  | 'Admins'
  | 'Mutations';

const CACHE_TTL_MS = 15_000;
const cache = new Map<SheetName, { at: number; rows: any[] }>();

let scriptUrlOverride = '';

/** URL Apps Script: dari .env, atau diatur sementara oleh super admin lewat halaman Pengaturan. */
export function getScriptUrl() {
  return scriptUrlOverride || process.env.GOOGLE_SCRIPT_URL || process.env.VITE_GOOGLE_SCRIPT_URL || '';
}

export function setScriptUrl(url: string) {
  scriptUrlOverride = url;
  cache.clear();
}

const secret = () => process.env.GAS_SECRET || '';

function requireUrl() {
  const url = getScriptUrl();
  if (!url) throw new Error('GOOGLE_SCRIPT_URL belum diatur');
  return url;
}

async function parse(response: Response, what: string) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${what} gagal (${response.status}): ${text.slice(0, 200)}`);
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Apps Script mengembalikan halaman HTML jika URL salah / belum di-deploy ulang
    throw new Error(`${what}: respons Apps Script bukan JSON. Periksa URL & deployment.`);
  }
  if (data && !Array.isArray(data) && data.error) throw new Error(`${what}: ${data.error}`);
  return data;
}

async function post(action: string, payload: Record<string, unknown>) {
  const response = await fetch(requireUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, secret: secret(), ...payload }),
    signal: AbortSignal.timeout(30_000),
  });
  return parse(response, action);
}

/** Ambil semua baris sebuah sheet (di-cache singkat). */
async function list<T = any>(sheet: SheetName, { fresh = false } = {}): Promise<T[]> {
  const hit = cache.get(sheet);
  if (!fresh && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows as T[];

  const url = `${requireUrl()}?action=list&sheet=${sheet}&secret=${encodeURIComponent(secret())}`;
  const rows = await parse(await fetch(url, { signal: AbortSignal.timeout(30_000) }), `list ${sheet}`);
  const result = Array.isArray(rows) ? rows : [];
  cache.set(sheet, { at: Date.now(), rows: result });
  return result as T[];
}

async function find<T = any>(sheet: SheetName, id: number | string): Promise<T | undefined> {
  const rows = await list<any>(sheet);
  return rows.find((r) => String(r.id) === String(id));
}

async function create<T = any>(sheet: SheetName, data: Record<string, unknown>): Promise<T> {
  const result = await post('create', { sheet, data });
  cache.delete(sheet);
  return result.data as T;
}

async function update<T = any>(sheet: SheetName, id: number | string, data: Record<string, unknown>): Promise<T> {
  const result = await post('update', { sheet, data: { ...data, id } });
  cache.delete(sheet);
  return result.data as T;
}

async function remove(sheet: SheetName, id: number | string): Promise<void> {
  await post('delete', { sheet, data: { id } });
  cache.delete(sheet);
}

/** Laporan dengan foto (base64) — foto disimpan ke Google Drive oleh Apps Script. */
async function addReport(data: Record<string, unknown>) {
  const result = await post('addReport', { data });
  cache.delete('Reports');
  return result.data;
}

export const sheets = { list, find, create, update, remove, addReport };
