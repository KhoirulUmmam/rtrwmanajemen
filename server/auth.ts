// Autentikasi sisi server: hash password (scrypt) + token bertanda tangan (HMAC).
// Tanpa session store, sehingga tetap jalan di Vercel serverless.
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type Role = 'superadmin' | 'admin' | 'resident';

export interface AuthUser {
  role: Role;
  rt: string;        // kode RT, "SUPERADMIN" untuk super admin
  id: string;        // id baris di sheet (Residents / Admins)
  name: string;
  nik?: string;
  exp: number;       // epoch detik
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthUser;
    }
  }
}

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 hari

let warned = false;
function secretKey() {
  const key = process.env.AUTH_SECRET;
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET wajib diatur di environment production');
  }
  if (!warned) {
    console.warn('⚠️  AUTH_SECRET belum diatur. Memakai kunci sementara (semua login hilang saat server restart).');
    warned = true;
  }
  return (globalThis as any).__devAuthSecret ??= crypto.randomBytes(32).toString('hex');
}

// ── Password ────────────────────────────────────────────────────────────────

/** Format tersimpan: scrypt$<salt hex>$<hash hex> */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function isHashed(stored: unknown): boolean {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

/** Cocokkan password. Mendukung password lama (teks biasa) agar bisa dimigrasi otomatis saat login. */
export function verifyPassword(password: string, stored: unknown): boolean {
  if (stored === undefined || stored === null || stored === '') return false;
  const value = String(stored);

  if (!isHashed(value)) {
    return safeEqual(password, value);
  }

  const [, saltHex, hashHex] = value.split('$');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ── Token ───────────────────────────────────────────────────────────────────

const b64url = (buf: Buffer | string) => Buffer.from(buf).toString('base64url');

export function signToken(user: Omit<AuthUser, 'exp'>): string {
  const payload: AuthUser = { ...user, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyToken(token: string): AuthUser | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', secretKey()).update(body).digest('base64url');
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as AuthUser;
    return payload.exp > Date.now() / 1000 ? payload : null;
  } catch {
    return null;
  }
}

// ── Middleware ──────────────────────────────────────────────────────────────

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.get('authorization') || '';
  const user = header.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
  if (!user) return res.status(401).json({ error: 'Sesi berakhir, silakan login kembali.' });
  req.auth = user;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== 'admin' && req.auth?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Hanya pengurus RT yang dapat melakukan aksi ini.' });
  }
  next();
}

export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role !== 'superadmin') {
    return res.status(403).json({ error: 'Hanya super admin yang dapat melakukan aksi ini.' });
  }
  next();
}

export const isAdminRole = (u?: AuthUser) => u?.role === 'admin' || u?.role === 'superadmin';

/** Apakah user boleh mengakses data milik RT tertentu. */
export function canAccessRt(u: AuthUser | undefined, rt: unknown): boolean {
  if (!u) return false;
  if (u.role === 'superadmin') return true;
  return String(rt ?? '').toUpperCase() === u.rt.toUpperCase();
}

// ── Pembatas percobaan login (in-memory) ────────────────────────────────────
// Hanya percobaan GAGAL yang dihitung, per kombinasi IP + akun. Warga satu RT sering berbagi
// satu IP (WiFi yang sama), jadi login yang berhasil tidak boleh ikut memblokir orang lain.
const MAX_FAILURES = 8;
const WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; until: number }>();

const loginKey = (req: Request) =>
  `${req.ip || 'unknown'}|${String(req.body?.type ?? '')}|${String(req.body?.rtCode ?? '').toUpperCase()}|${String(req.body?.nik ?? '')}`;

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const entry = failures.get(loginKey(req));
  if (entry && entry.until > Date.now() && entry.count >= MAX_FAILURES) {
    return res.status(429).json({ error: 'Terlalu banyak percobaan login gagal. Coba lagi dalam 15 menit.' });
  }
  next();
}

export function noteLoginFailure(req: Request) {
  const key = loginKey(req);
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.until < now) failures.set(key, { count: 1, until: now + WINDOW_MS });
  else entry.count++;
}

export function noteLoginSuccess(req: Request) {
  failures.delete(loginKey(req));
}

// Pendaftaran: batasi jumlah per IP agar tidak dibanjiri akun palsu
const registrations = new Map<string, { count: number; until: number }>();

export function registerRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const entry = registrations.get(key);
  if (entry && entry.until > now && entry.count >= 20) {
    return res.status(429).json({ error: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.' });
  }
  if (!entry || entry.until < now) registrations.set(key, { count: 1, until: now + 60 * 60_000 });
  else entry.count++;
  next();
}
