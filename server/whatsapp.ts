// Klien WhatsApp Gateway (VPS). Semua panggilan membawa VPS_API_KEY.
import type { Request } from 'express';

let vpsUrlOverride = '';

export function getVpsUrl() {
  return vpsUrlOverride || process.env.VPS_WHATSAPP_URL || process.env.VITE_VPS_URL || process.env.VPS_WA_URL || '';
}

export function setVpsUrl(url: string) {
  vpsUrlOverride = url;
}

/** ID sesi WA: WA_SESSION_ID dari .env, atau dibentuk dari hostname. */
export function getSessionId(req: Request) {
  if (process.env.WA_SESSION_ID) return process.env.WA_SESSION_ID;
  if (req.headers.host) return req.headers.host.replace(/[^a-zA-Z0-9]/g, '_');
  return 'session_default';
}

export async function vpsFetch(pathname: string, options: { method?: string; body?: unknown } = {}) {
  const baseUrl = getVpsUrl().replace(/\/$/, '');
  if (!baseUrl) throw Object.assign(new Error('URL VPS WhatsApp belum diatur'), { status: 400 });

  const response = await fetch(`${baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(process.env.VPS_API_KEY ? { 'x-api-key': process.env.VPS_API_KEY } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 404) {
    throw Object.assign(new Error(data.error || `Gateway membalas ${response.status}`), { status: response.status });
  }
  return data;
}

/**
 * Ambil nomor WA yang bisa dikirimi dari kolom phone.
 * Kolom phone bisa berisi beberapa nilai dipisah koma (termasuk ID LID hasil verifikasi bot).
 */
export function primaryPhone(phone: unknown): string | null {
  const candidates = String(phone ?? '')
    .split(',')
    .map((p) => p.trim().replace(/\D/g, ''))
    .filter(Boolean);
  const valid = candidates.find((p) => /^(0|62|8)\d{8,13}$/.test(p));
  return valid ?? null;
}

/** Kirim pesan ke satu nomor. Tidak melempar error: notifikasi WA bersifat "best effort". */
export async function sendWa(req: Request, to: string | null, text: string, document?: { base64: string; fileName: string; mimeType?: string }) {
  if (!to || !getVpsUrl()) return { ok: false, reason: 'nomor/gateway tidak tersedia' };
  try {
    await vpsFetch(`/session/${getSessionId(req)}/send`, {
      method: 'POST',
      body: document
        ? { to, text, document: document.base64, fileName: document.fileName, mimeType: document.mimeType || 'application/pdf' }
        : { to, text },
    });
    return { ok: true };
  } catch (e: any) {
    console.error(`[WA] Gagal kirim ke ${to}:`, e.message);
    return { ok: false, reason: e.message };
  }
}

/** Broadcast ke banyak nomor (diantrekan di gateway dengan jeda acak). */
export async function broadcastWa(req: Request, recipients: string[], text: string) {
  const unique = [...new Set(recipients.filter(Boolean))];
  if (!unique.length) return { status: 'skipped', total: 0 };
  return vpsFetch(`/session/${getSessionId(req)}/broadcast`, { method: 'POST', body: { recipients: unique, text } });
}
