import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { sheets, getScriptUrl, setScriptUrl } from "./server/sheets.js";
import {
  hashPassword, verifyPassword, isHashed, safeEqual, signToken,
  requireAuth, requireAdmin, requireSuperAdmin, isAdminRole, canAccessRt,
  loginRateLimit, noteLoginFailure, noteLoginSuccess, registerRateLimit,
  type AuthUser,
} from "./server/auth.js";
import { vpsFetch, getVpsUrl, setVpsUrl, getSessionId, sendWa, broadcastWa, primaryPhone } from "./server/whatsapp.js";
import { generateLetterPdf } from "./server/letterPdf.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// =============================================================================
// Helper
// =============================================================================

/** Bungkus handler async agar error diteruskan ke error handler global. */
const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const today = () => new Date().toISOString().split("T")[0];
const upper = (v: unknown) => String(v ?? "").trim().toUpperCase();
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** 08xx / +62 8xx / 628xx -> 628xx */
function normalizePhone(v: unknown) {
  let d = digits(v);
  if (d.startsWith("0")) d = "62" + d.slice(1);
  else if (d.startsWith("8")) d = "62" + d;
  return d;
}

/** RT target untuk data baru: admin/warga selalu RT-nya sendiri; super admin boleh memilih. */
function targetRt(req: Request, requested?: unknown) {
  return req.auth!.role === "superadmin" ? upper(requested) : req.auth!.rt;
}

/** Filter baris sesuai RT user. Data tanpa RT (global) hanya untuk tabel yang mengizinkan. */
function scoped<T extends { rt?: unknown }>(rows: T[], req: Request, { includeGlobal = false } = {}) {
  if (req.auth!.role === "superadmin") return rows;
  return rows.filter((r) => canAccessRt(req.auth, r.rt) || (includeGlobal && !r.rt));
}

const ACTIVE_STATUSES = ["Tetap", "Kontrak", "Kost"];
const isActiveResident = (r: any) => !["Pindah", "Meninggal"].includes(String(r.status)) && r.verified !== "pending";

/** Hapus password; untuk warga yang melihat data warga lain, tampilkan kolom non-sensitif saja. */
function publicResident(r: any, viewer?: AuthUser) {
  const { password, ...rest } = r;
  if (viewer && !isAdminRole(viewer) && String(r.id) !== viewer.id) {
    return { id: r.id, name: r.name, gender: r.gender, status: r.status, maritalStatus: r.maritalStatus, rt: r.rt, rw: r.rw };
  }
  return rest;
}

async function getScopedOr404(sheet: Parameters<typeof sheets.find>[0], id: string, req: Request) {
  const row: any = await sheets.find(sheet, id);
  if (!row || !canAccessRt(req.auth, row.rt)) throw new HttpError(404, "Data tidak ditemukan");
  return row;
}

/** Nomor WA warga yang aktif di sebuah RT (untuk broadcast). */
async function residentPhonesInRt(rt: string) {
  const residents = await sheets.list("Residents");
  return residents
    .filter((r: any) => (rt ? upper(r.rt) === upper(rt) : true) && isActiveResident(r))
    .map((r: any) => primaryPhone(r.phone))
    .filter(Boolean) as string[];
}

/** Nomor WA pengurus RT (untuk notifikasi permohonan baru). */
async function adminPhonesInRt(rt: string) {
  const admins = await sheets.list("Admins");
  return admins.filter((a: any) => upper(a.rtId) === upper(rt)).map((a: any) => primaryPhone(a.phone)).filter(Boolean) as string[];
}

function findResidentByRef(residents: any[], ref: unknown) {
  return residents.find((r) => String(r.id) === String(ref) || (r.nik && String(r.nik) === String(ref)));
}

const pick = (obj: any, keys: string[]) =>
  Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, typeof obj[k] === "string" ? obj[k].trim() : obj[k]]));

const RESIDENT_FIELDS = ["name", "nik", "address", "rw", "status", "phone", "gender", "maritalStatus", "familyRelationship", "familyCardNumber"];

function validateResident(data: any, { partial = false } = {}) {
  if (!partial || data.name !== undefined) {
    if (!String(data.name ?? "").trim()) throw new HttpError(422, "Nama wajib diisi");
  }
  if (!partial || data.nik !== undefined) {
    if (!/^\d{16}$/.test(String(data.nik ?? ""))) throw new HttpError(422, "NIK harus 16 digit angka");
  }
  if (data.familyCardNumber && !/^\d{16}$/.test(String(data.familyCardNumber))) {
    throw new HttpError(422, "No. KK harus 16 digit angka");
  }
  if (data.phone && !/^[\d+\-\s,]{8,}$/.test(String(data.phone))) throw new HttpError(422, "Format nomor HP tidak valid");
  if (data.password !== undefined && data.password !== "" && String(data.password).length < 6) {
    throw new HttpError(422, "Password minimal 6 karakter");
  }
}

async function ensureUniqueNik(nik: string, exceptId?: string) {
  const residents = await sheets.list("Residents", { fresh: true });
  if (residents.some((r: any) => String(r.nik) === nik && String(r.id) !== String(exceptId))) {
    throw new HttpError(409, "NIK sudah terdaftar");
  }
}

// =============================================================================
// Autentikasi (publik)
// =============================================================================

async function handleLogin(req: Request, res: Response) {
  const type = req.body.type === "admin" ? "admin" : "resident";
  const rtCode = upper(req.body.rtCode);
  const password = String(req.body.password ?? "");
  if (!rtCode || !password) throw new HttpError(422, "Kode RT dan password wajib diisi");

  if (type === "admin") {
    // Super admin dari environment (pengganti backdoor lama)
    if (rtCode === "SUPERADMIN") {
      const expected = process.env.SUPERADMIN_PASSWORD;
      if (!expected || !safeEqual(password, expected)) throw new HttpError(401, "Kode RT atau password salah");
      const user = { role: "superadmin" as const, rt: "SUPERADMIN", id: "superadmin", name: "Super Administrator" };
      return res.json({ token: signToken(user), user: { ...user, rtId: user.rt } });
    }

    const admins = await sheets.list("Admins", { fresh: true });
    const admin = admins.find((a: any) => upper(a.rtId) === rtCode && verifyPassword(password, a.password));
    if (!admin) throw new HttpError(401, "Kode RT atau password salah");

    // Migrasi otomatis password teks biasa -> hash
    if (!isHashed(admin.password)) await sheets.update("Admins", admin.id, { password: hashPassword(password) });

    const role = String(admin.role).toLowerCase() === "superadmin" ? "superadmin" as const : "admin" as const;
    const user = { role, rt: rtCode, id: String(admin.id), name: admin.name || `Pengurus ${rtCode}` };
    return res.json({ token: signToken(user), user: { ...user, rtId: rtCode } });
  }

  const nik = digits(req.body.nik);
  const residents = await sheets.list("Residents", { fresh: true });
  const resident = residents.find((r: any) => upper(r.rt) === rtCode && String(r.nik) === nik);
  if (!resident || !verifyPassword(password, resident.password)) throw new HttpError(401, "NIK, password, atau kode RT salah");
  if (resident.verified === "pending") throw new HttpError(403, "Pendaftaran Anda masih menunggu verifikasi pengurus RT.");
  if (!isActiveResident(resident)) throw new HttpError(403, "Akun ini sudah tidak aktif (pindah/meninggal).");

  if (!isHashed(resident.password)) await sheets.update("Residents", resident.id, { password: hashPassword(password) });

  const user = { role: "resident" as const, rt: rtCode, id: String(resident.id), name: resident.name, nik };
  res.json({ token: signToken(user), user: { ...publicResident(resident), role: "resident", rtId: rtCode } });
}

app.post("/api/auth/login", loginRateLimit, wrap(async (req, res) => {
  try {
    await handleLogin(req, res);
    noteLoginSuccess(req);
  } catch (err) {
    // Hanya kegagalan kredensial yang dihitung untuk pembatasan percobaan
    if (err instanceof HttpError && err.status === 401) noteLoginFailure(req);
    throw err;
  }
}));

app.post("/api/auth/register", registerRateLimit, wrap(async (req, res) => {
  const data = {
    rt: upper(req.body.rtCode),
    nik: digits(req.body.nik),
    name: String(req.body.name ?? "").trim(),
    phone: String(req.body.phone ?? "").trim(),
    password: String(req.body.password ?? ""),
  };
  if (!data.rt) throw new HttpError(422, "Kode RT wajib diisi");
  if (!data.password) throw new HttpError(422, "Password wajib diisi");
  validateResident(data);

  // Kode RT harus benar-benar ada (punya pengurus terdaftar)
  const admins = await sheets.list("Admins");
  if (!admins.some((a: any) => upper(a.rtId) === data.rt)) throw new HttpError(422, "Kode RT tidak dikenal");
  await ensureUniqueNik(data.nik);

  await sheets.create("Residents", {
    ...data,
    password: hashPassword(data.password),
    rw: process.env.DEFAULT_RW || "",
    status: "Tetap",
    gender: "",
    maritalStatus: "",
    familyRelationship: "",
    familyCardNumber: "",
    address: "",
    verified: "pending",
  });

  // Beri tahu pengurus RT lewat WA
  for (const phone of await adminPhonesInRt(data.rt)) {
    await sendWa(req, phone, `🔔 *Pendaftaran warga baru ${data.rt}*\n\nNama: ${data.name}\nHP: ${data.phone}\n\nSilakan verifikasi di menu Data Warga.`);
  }

  res.status(201).json({ message: "Pendaftaran berhasil. Akun aktif setelah diverifikasi pengurus RT." });
}));

// =============================================================================
// Webhook WhatsApp (dipanggil gateway, diamankan dengan WEBHOOK_SECRET)
// =============================================================================

app.post("/api/whatsapp/webhook", wrap(async (req, res) => {
  if (process.env.WEBHOOK_SECRET && req.get("x-webhook-secret") !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  const { sender, senderLid, message, image } = req.body;
  if (!sender || !message) return res.status(400).json({ error: "Invalid payload" });

  const text = String(message).trim();
  const msgUpper = text.toUpperCase();
  const senderPhone = normalizePhone(sender);
  const lid = digits(senderLid);

  if (msgUpper === "CEKID") {
    return res.json({ reply: `Nomor WhatsApp Anda: ${senderPhone}${lid ? `\nID perangkat: ${lid}` : ""}\n\nBerikan informasi ini ke pengurus RT jika nomor Anda belum dikenali.` });
  }

  // Cocokkan pengirim dengan kolom phone warga (bisa berisi beberapa nomor dipisah koma)
  const residents = await sheets.list("Residents");
  const resident = residents.find((r: any) => {
    if (!isActiveResident(r) || !r.phone) return false;
    const phones = String(r.phone).split(",").map((p) => normalizePhone(p)).filter(Boolean);
    return phones.includes(senderPhone) || (lid !== "" && phones.includes(lid));
  });

  if (!resident) {
    return res.json({ reply: `Maaf, nomor WhatsApp ini (${senderPhone}) belum terdaftar sebagai warga.\n\nSilakan daftar lewat aplikasi web atau hubungi pengurus RT agar nomor Anda ditambahkan.` });
  }

  const rtCode = upper(resident.rt) || "RT";

  if (msgUpper === "MENU" || msgUpper === "PING" || msgUpper === "HALO") {
    return res.json({
      reply: `Halo Bpk/Ibu *${resident.name}* dari *${rtCode}* 👋\n\nLayanan WhatsApp RT:\n` +
        `1. *LAPOR [isi laporan]* — kirim keluhan (boleh sambil kirim foto)\n` +
        `2. *STATUS LAPORAN* — cek laporan terakhir Anda\n` +
        `3. *SURAT [keperluan]* — buat surat pengantar (PDF)\n` +
        `4. *INFO* — pengumuman terbaru\n` +
        `5. *KAS* — ringkasan kas RT`,
    });
  }

  if (msgUpper.startsWith("SURAT")) {
    const purpose = text.slice(5).replace(/^[:\s]+/, "").trim();
    if (purpose.length < 3) return res.json({ reply: "Mohon tuliskan keperluannya. Contoh: *SURAT Pembuatan KTP*" });

    const letter: any = await sheets.create("Letters", {
      residentName: resident.name, residentId: resident.id, type: "Surat Pengantar", status: "Menunggu",
      date: today(), rt: resident.rt, content: `${purpose} (via WhatsApp)`,
    });
    const pdf = await generateLetterPdf({ resident, type: "Surat Pengantar", purpose, number: letter.id });
    for (const phone of await adminPhonesInRt(rtCode)) {
      await sendWa(req, phone, `📝 *Permohonan surat via WA*\n\nWarga: ${resident.name}\nKeperluan: ${purpose}`);
    }
    return res.json({
      reply: "✅ Permohonan surat pengantar Anda tercatat.\n\nDraf surat terlampir. Silakan cetak dan mintakan tanda tangan Ketua RT.",
      document: pdf,
      fileName: `Surat_Pengantar_${String(resident.name).replace(/\s+/g, "_")}.pdf`,
      mimeType: "application/pdf",
    });
  }

  const isReport = image || msgUpper.startsWith("LAPOR");
  if (isReport) {
    let description = text.replace(/^LAPOR[:\s]*/i, "").trim();
    if (description === "[Foto]") description = "";
    if (!image && description.length < 5) return res.json({ reply: "Laporan terlalu singkat. Contoh: *LAPOR Lampu jalan di depan rumah no. 12 mati*" });

    const report = {
      residentId: resident.id, residentName: resident.name,
      title: image ? "[WA] Laporan Foto" : "[WA] Laporan Warga",
      description: description || "[Melampirkan foto]",
      date: today(), status: "Menunggu", rt: resident.rt,
    };
    if (image) await sheets.addReport({ ...report, image });
    else await sheets.create("Reports", report);

    for (const phone of await adminPhonesInRt(rtCode)) {
      await sendWa(req, phone, `🚨 *Laporan baru dari ${resident.name}*\n\n${report.description}`);
    }
    return res.json({ reply: `✅ Laporan Anda sudah diterima pengurus *${rtCode}*.\n\nKetik *STATUS LAPORAN* untuk mengecek perkembangannya.` });
  }

  if (msgUpper === "STATUS LAPORAN" || msgUpper === "STATUS") {
    const reports = await sheets.list("Reports");
    const mine = reports.filter((r: any) => String(r.residentId) === String(resident.id) || String(r.residentId) === String(resident.nik));
    const latest = mine[mine.length - 1];
    if (!latest) return res.json({ reply: "Anda belum memiliki laporan." });
    return res.json({ reply: `*Laporan terakhir Anda*\n\nTanggal: ${latest.date}\nIsi: ${latest.description}\nStatus: *${latest.status}*` });
  }

  if (msgUpper === "INFO") {
    const announcements = await sheets.list("Announcements");
    const mine = announcements.filter((a: any) => upper(a.rt) === rtCode || !a.rt);
    const latest = mine[mine.length - 1];
    if (!latest) return res.json({ reply: `Belum ada pengumuman untuk ${rtCode}.` });
    return res.json({ reply: `📢 *Pengumuman ${rtCode}*\n\n*${latest.title}*\n${latest.date}\n\n${latest.content}` });
  }

  if (msgUpper === "KAS" || msgUpper === "IURAN") {
    const tx = (await sheets.list("Transactions")).filter((t: any) => upper(t.rt) === rtCode);
    const income = tx.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const expense = tx.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount || 0), 0);
    const rp = (n: number) => "Rp " + n.toLocaleString("id-ID");
    return res.json({ reply: `💰 *Kas ${rtCode}*\n\nPemasukan: ${rp(income)}\nPengeluaran: ${rp(expense)}\n*Saldo: ${rp(income - expense)}*` });
  }

  return res.json({ reply: "Maaf, perintah tidak dikenali. Ketik *MENU* untuk melihat daftar perintah." });
}));

// =============================================================================
// Semua route di bawah ini WAJIB login
// =============================================================================
app.use("/api", requireAuth);

/** Super admin utama dari env (SUPERADMIN_PASSWORD) tidak punya baris di sheet Admins. */
const isEnvSuperAdmin = (auth: AuthUser) => auth.role === "superadmin" && auth.id === "superadmin";

app.get("/api/auth/me", wrap(async (req, res) => {
  const auth = req.auth!;
  if (auth.role !== "resident") {
    if (isEnvSuperAdmin(auth)) return res.json({ ...auth, rtId: auth.rt, envAccount: true });
    const admin = await sheets.find("Admins", auth.id);
    if (!admin) throw new HttpError(401, "Akun tidak ditemukan");
    return res.json({ ...publicAdmin(admin), role: auth.role, rt: auth.rt, rtId: auth.rt });
  }
  const resident = await sheets.find("Residents", auth.id);
  if (!resident) throw new HttpError(401, "Akun tidak ditemukan");
  res.json({ ...publicResident(resident), role: "resident", rtId: auth.rt });
}));

// ── Warga ────────────────────────────────────────────────────────────────────

app.get("/api/residents", wrap(async (req, res) => {
  const rows = scoped(await sheets.list("Residents"), req);
  res.json(rows.map((r) => publicResident(r, req.auth)));
}));

app.get("/api/residents/:id", wrap(async (req, res) => {
  const r = await getScopedOr404("Residents", req.params.id, req);
  if (!isAdminRole(req.auth) && String(r.id) !== req.auth!.id) throw new HttpError(403, "Akses ditolak");
  res.json(publicResident(r));
}));

app.get("/api/residents/:id/family", wrap(async (req, res) => {
  const r = await getScopedOr404("Residents", req.params.id, req);
  if (!isAdminRole(req.auth) && String(r.id) !== req.auth!.id) throw new HttpError(403, "Akses ditolak");
  if (!r.familyCardNumber) return res.json([]);
  const family = (await sheets.list("Residents")).filter(
    (m: any) => String(m.familyCardNumber) === String(r.familyCardNumber) && String(m.id) !== String(r.id),
  );
  res.json(family.map((m) => publicResident(m)));
}));

app.post("/api/residents", requireAdmin, wrap(async (req, res) => {
  const data: any = pick(req.body, [...RESIDENT_FIELDS, "password"]);
  data.nik = digits(data.nik);
  validateResident(data);
  await ensureUniqueNik(data.nik);

  const created = await sheets.create("Residents", {
    ...data,
    rt: targetRt(req, req.body.rt),
    status: ACTIVE_STATUSES.includes(data.status) ? data.status : "Tetap",
    password: data.password ? hashPassword(data.password) : "",
    verified: "yes",
  });
  res.status(201).json(publicResident(created));
}));

app.put("/api/residents/:id", wrap(async (req, res) => {
  const current = await getScopedOr404("Residents", req.params.id, req);
  const isSelf = String(current.id) === req.auth!.id && req.auth!.role === "resident";
  if (!isAdminRole(req.auth) && !isSelf) throw new HttpError(403, "Akses ditolak");

  // Warga boleh melengkapi data pelengkap miliknya; identitas (nama, NIK, RT/RW, status) hanya lewat pengurus
  const allowed = isSelf
    ? ["phone", "address", "gender", "maritalStatus", "familyRelationship", "familyCardNumber", "password"]
    : [...RESIDENT_FIELDS, "password"];
  const data: any = pick(req.body, allowed);
  if (data.nik !== undefined) data.nik = digits(data.nik);
  validateResident(data, { partial: true });
  if (data.nik && data.nik !== String(current.nik)) await ensureUniqueNik(data.nik, current.id);

  if (isSelf && data.password) {
    if (!verifyPassword(String(req.body.currentPassword ?? ""), current.password)) {
      throw new HttpError(422, "Password lama salah");
    }
  }
  if (data.password) data.password = hashPassword(data.password);
  else delete data.password;

  const updated = await sheets.update("Residents", current.id, data);
  res.json(publicResident(updated));
}));

app.delete("/api/residents/:id", requireAdmin, wrap(async (req, res) => {
  const r = await getScopedOr404("Residents", req.params.id, req);
  await sheets.remove("Residents", r.id);
  res.json({ status: "deleted" });
}));

app.post("/api/residents/:id/verify", requireAdmin, wrap(async (req, res) => {
  const r = await getScopedOr404("Residents", req.params.id, req);
  const updated = await sheets.update("Residents", r.id, { verified: "yes" });
  await sendWa(req, primaryPhone(r.phone),
    `✅ Halo *${r.name}*, pendaftaran Anda sebagai warga *${upper(r.rt)}* sudah diverifikasi.\n\nAnda sekarang bisa login ke aplikasi dan memakai layanan WhatsApp ini. Ketik *MENU* untuk memulai.`);
  res.json(publicResident(updated));
}));

app.post("/api/residents/:id/mutate", requireAdmin, wrap(async (req, res) => {
  const r = await getScopedOr404("Residents", req.params.id, req);
  const type = req.body.type === "Meninggal" ? "Meninggal" : "Pindah";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.body.date)) ? req.body.date : today();

  await sheets.create("Mutations", {
    residentId: r.id, residentName: r.name, type, date, details: String(req.body.details ?? "").trim(), rt: r.rt,
  });
  const updated = await sheets.update("Residents", r.id, { status: type });
  res.json(publicResident(updated));
}));

app.get("/api/mutations", requireAdmin, wrap(async (req, res) => {
  res.json(scoped(await sheets.list("Mutations"), req));
}));

// ── Pengumuman ───────────────────────────────────────────────────────────────

const announcementMessage = (a: any) => `📢 *PENGUMUMAN ${a.rt || "RT/RW"}*\n\n*${a.title}*\n\n${a.content}`;

app.get("/api/announcements", wrap(async (req, res) => {
  res.json(scoped(await sheets.list("Announcements"), req, { includeGlobal: true }).reverse());
}));

app.post("/api/announcements", requireAdmin, wrap(async (req, res) => {
  const data: any = pick(req.body, ["title", "content"]);
  if (!data.title || !data.content) throw new HttpError(422, "Judul dan isi pengumuman wajib diisi");

  const created: any = await sheets.create("Announcements", { ...data, date: today(), rt: targetRt(req, req.body.rt) });

  let broadcast = null;
  if (req.body.broadcast) {
    broadcast = await broadcastWa(req, await residentPhonesInRt(created.rt), announcementMessage(created))
      .catch((e) => ({ status: "error", error: e.message }));
  }
  res.status(201).json({ ...created, broadcast });
}));

app.put("/api/announcements/:id", requireAdmin, wrap(async (req, res) => {
  const a = await getScopedOr404("Announcements", req.params.id, req);
  const data: any = pick(req.body, ["title", "content"]);
  res.json(await sheets.update("Announcements", a.id, data));
}));

app.delete("/api/announcements/:id", requireAdmin, wrap(async (req, res) => {
  const a = await getScopedOr404("Announcements", req.params.id, req);
  await sheets.remove("Announcements", a.id);
  res.json({ status: "deleted" });
}));

app.post("/api/announcements/:id/broadcast", requireAdmin, wrap(async (req, res) => {
  const a = await getScopedOr404("Announcements", req.params.id, req);
  res.status(202).json(await broadcastWa(req, await residentPhonesInRt(a.rt), announcementMessage(a)));
}));

// ── Surat ────────────────────────────────────────────────────────────────────

const LETTER_STATUSES = ["Menunggu", "Proses", "Selesai", "Ditolak"];
const withResidentAlias = (l: any) => ({ ...l, resident: l.residentName }); // kompatibilitas tampilan lama

async function getLetterFor(req: Request, id: string) {
  const letter = await getScopedOr404("Letters", id, req);
  if (!isAdminRole(req.auth) && String(letter.residentId) !== req.auth!.id) throw new HttpError(404, "Data tidak ditemukan");
  return letter;
}

app.get("/api/letters", wrap(async (req, res) => {
  let rows = scoped(await sheets.list("Letters"), req);
  if (!isAdminRole(req.auth)) rows = rows.filter((l: any) => String(l.residentId) === req.auth!.id);
  res.json(rows.map(withResidentAlias).reverse());
}));

app.post("/api/letters", wrap(async (req, res) => {
  const type = String(req.body.type ?? "").trim();
  if (!type) throw new HttpError(422, "Jenis surat wajib diisi");

  let resident: any;
  if (isAdminRole(req.auth)) {
    resident = await getScopedOr404("Residents", String(req.body.residentId ?? ""), req);
  } else {
    resident = await sheets.find("Residents", req.auth!.id);
  }
  if (!resident) throw new HttpError(422, "Warga pemohon tidak ditemukan");

  const status = isAdminRole(req.auth) && LETTER_STATUSES.includes(req.body.status) ? req.body.status : "Menunggu";
  const created = await sheets.create("Letters", {
    residentId: resident.id, residentName: resident.name, type, status,
    date: today(), rt: resident.rt, content: String(req.body.content ?? "").trim(),
  });

  if (!isAdminRole(req.auth)) {
    for (const phone of await adminPhonesInRt(upper(resident.rt))) {
      await sendWa(req, phone, `📝 *Permohonan surat baru*\n\nWarga: ${resident.name}\nJenis: ${type}\nKeperluan: ${created.content || "-"}`);
    }
  }
  res.status(201).json(withResidentAlias(created));
}));

app.put("/api/letters/:id", requireAdmin, wrap(async (req, res) => {
  const letter = await getLetterFor(req, req.params.id);
  res.json(withResidentAlias(await sheets.update("Letters", letter.id, pick(req.body, ["type", "content"]))));
}));

app.patch("/api/letters/:id/status", requireAdmin, wrap(async (req, res) => {
  const letter = await getLetterFor(req, req.params.id);
  const status = String(req.body.status);
  if (!LETTER_STATUSES.includes(status)) throw new HttpError(422, "Status tidak valid");
  const updated = await sheets.update("Letters", letter.id, { status });

  // Notifikasi WA ke pemohon; surat selesai dikirim beserta PDF-nya
  const resident = findResidentByRef(await sheets.list("Residents"), letter.residentId)
    ?? (await sheets.list("Residents")).find((r: any) => r.name === letter.residentName && upper(r.rt) === upper(letter.rt));
  let whatsapp = null;
  if (resident && status !== letter.status) {
    const phone = primaryPhone(resident.phone);
    if (status === "Selesai") {
      const pdf = await generateLetterPdf({ resident, type: letter.type, purpose: letter.content, number: letter.id });
      whatsapp = await sendWa(req, phone, `✅ *${letter.type}* Anda sudah selesai.\nSilakan ambil versi bertanda tangan di Ketua RT.`,
        { base64: pdf, fileName: `${String(letter.type).replace(/\s+/g, "_")}_${String(resident.name).replace(/\s+/g, "_")}.pdf` });
    } else {
      whatsapp = await sendWa(req, phone, `ℹ️ Status *${letter.type}* Anda sekarang: *${status}*.`);
    }
  }
  res.json({ ...withResidentAlias(updated), whatsapp });
}));

app.get("/api/letters/:id/pdf", wrap(async (req, res) => {
  const letter = await getLetterFor(req, req.params.id);
  const resident = findResidentByRef(await sheets.list("Residents"), letter.residentId);
  if (!resident) throw new HttpError(404, "Data warga pemohon tidak ditemukan");
  const pdf = await generateLetterPdf({ resident, type: letter.type, purpose: letter.content, number: letter.id });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="Surat_${letter.id}.pdf"`);
  res.send(Buffer.from(pdf, "base64"));
}));

app.delete("/api/letters/:id", wrap(async (req, res) => {
  const letter = await getLetterFor(req, req.params.id);
  // Warga hanya boleh membatalkan permohonan yang belum diproses
  if (!isAdminRole(req.auth) && letter.status !== "Menunggu") throw new HttpError(403, "Surat yang sudah diproses tidak bisa dibatalkan");
  await sheets.remove("Letters", letter.id);
  res.json({ status: "deleted" });
}));

// ── Keuangan ─────────────────────────────────────────────────────────────────

function validateTransaction(body: any, { partial = false } = {}) {
  const data: any = pick(body, ["type", "amount", "category", "description", "date"]);
  if (data.amount !== undefined) data.amount = Number(String(data.amount).replace(/\D/g, ""));
  if (!partial || data.type !== undefined) {
    if (!["income", "expense"].includes(data.type)) throw new HttpError(422, "Jenis transaksi tidak valid");
  }
  if (!partial || data.amount !== undefined) {
    if (!(data.amount > 0)) throw new HttpError(422, "Jumlah harus lebih dari 0");
  }
  if (!partial || data.description !== undefined) {
    if (!data.description) throw new HttpError(422, "Keterangan wajib diisi");
  }
  if (data.date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new HttpError(422, "Format tanggal tidak valid");
  return data;
}

// Warga boleh melihat kas RT-nya (transparansi), hanya pengurus yang boleh mengubah
app.get("/api/transactions", wrap(async (req, res) => {
  const rows = scoped(await sheets.list("Transactions"), req).map((t: any) => ({ ...t, amount: Number(t.amount) || 0 }));
  res.json(rows.reverse());
}));

app.post("/api/transactions", requireAdmin, wrap(async (req, res) => {
  const data = validateTransaction(req.body);
  res.status(201).json(await sheets.create("Transactions", { date: today(), category: "Lainnya", ...data, rt: targetRt(req, req.body.rt) }));
}));

app.put("/api/transactions/:id", requireAdmin, wrap(async (req, res) => {
  const t = await getScopedOr404("Transactions", req.params.id, req);
  res.json(await sheets.update("Transactions", t.id, validateTransaction(req.body, { partial: true })));
}));

app.delete("/api/transactions/:id", requireAdmin, wrap(async (req, res) => {
  const t = await getScopedOr404("Transactions", req.params.id, req);
  await sheets.remove("Transactions", t.id);
  res.json({ status: "deleted" });
}));

// ── Laporan warga ────────────────────────────────────────────────────────────

const REPORT_STATUSES = ["Menunggu", "Diproses", "Selesai", "Ditolak"];

app.get("/api/reports", wrap(async (req, res) => {
  let rows = scoped(await sheets.list("Reports"), req);
  if (!isAdminRole(req.auth)) {
    rows = rows.filter((r: any) => String(r.residentId) === req.auth!.id || (req.auth!.nik && String(r.residentId) === req.auth!.nik));
  }
  res.json(rows.reverse());
}));

app.post("/api/reports", wrap(async (req, res) => {
  const data: any = pick(req.body, ["title", "description"]);
  if (!data.title || !data.description) throw new HttpError(422, "Judul dan isi laporan wajib diisi");
  const resident: any = req.auth!.role === "resident" ? await sheets.find("Residents", req.auth!.id) : null;
  const created = await sheets.create("Reports", {
    ...data,
    residentId: req.auth!.id,
    residentName: resident?.name ?? req.auth!.name,
    date: today(),
    status: "Menunggu",
    rt: req.auth!.role === "superadmin" ? upper(req.body.rt) : req.auth!.rt,
  });
  res.status(201).json(created);
}));

app.patch("/api/reports/:id/status", requireAdmin, wrap(async (req, res) => {
  const report = await getScopedOr404("Reports", req.params.id, req);
  const status = String(req.body.status);
  if (!REPORT_STATUSES.includes(status)) throw new HttpError(422, "Status tidak valid");
  const updated = await sheets.update("Reports", report.id, { status });

  let whatsapp = null;
  if (status !== report.status) {
    const resident = findResidentByRef(await sheets.list("Residents"), report.residentId);
    const note = String(req.body.note ?? "").trim();
    const icon = { Diproses: "🔧", Selesai: "✅", Ditolak: "❌", Menunggu: "⏳" }[status];
    whatsapp = await sendWa(req, primaryPhone(resident?.phone),
      `${icon} Laporan Anda *"${String(report.description).slice(0, 80)}"* sekarang berstatus *${status}*.${note ? `\n\nCatatan pengurus: ${note}` : ""}`);
  }
  res.json({ ...updated, whatsapp });
}));

app.delete("/api/reports/:id", requireAdmin, wrap(async (req, res) => {
  const report = await getScopedOr404("Reports", req.params.id, req);
  await sheets.remove("Reports", report.id);
  res.json({ status: "deleted" });
}));

// ── Pengurus RT (khusus super admin) ────────────────────────────────────────

const publicAdmin = ({ password, ...a }: any) => a;

app.get("/api/admins", requireSuperAdmin, wrap(async (_req, res) => {
  res.json((await sheets.list("Admins")).map(publicAdmin));
}));

app.post("/api/admins", requireSuperAdmin, wrap(async (req, res) => {
  const data: any = pick(req.body, ["username", "name", "rtId", "phone", "role", "password"]);
  data.rtId = upper(data.rtId);
  if (!data.rtId || !data.name) throw new HttpError(422, "Kode RT dan nama wajib diisi");
  if (!data.password || String(data.password).length < 6) throw new HttpError(422, "Password minimal 6 karakter");
  const created = await sheets.create("Admins", {
    ...data,
    username: data.username || data.rtId.toLowerCase(),
    role: data.role === "superadmin" ? "superadmin" : "admin",
    password: hashPassword(data.password),
  });
  res.status(201).json(publicAdmin(created));
}));

app.put("/api/admins/:id", requireSuperAdmin, wrap(async (req, res) => {
  const admin = await sheets.find("Admins", req.params.id);
  if (!admin) throw new HttpError(404, "Data tidak ditemukan");
  const data: any = pick(req.body, ["username", "name", "rtId", "phone", "role", "password"]);
  if (data.rtId !== undefined) data.rtId = upper(data.rtId);
  if (data.password) {
    if (String(data.password).length < 6) throw new HttpError(422, "Password minimal 6 karakter");
    data.password = hashPassword(data.password);
  } else delete data.password;
  res.json(publicAdmin(await sheets.update("Admins", admin.id, data)));
}));

/** Pengurus mengubah akunnya sendiri: nama, nomor WA, dan password (wajib password lama). */
app.put("/api/account", requireAdmin, wrap(async (req, res) => {
  const auth = req.auth!;
  if (isEnvSuperAdmin(auth)) {
    throw new HttpError(400, "Akun super admin utama diatur lewat environment SUPERADMIN_PASSWORD.");
  }
  const admin: any = await sheets.find("Admins", auth.id);
  if (!admin) throw new HttpError(404, "Akun tidak ditemukan");

  const data: any = pick(req.body, ["name", "phone"]);
  if (data.name !== undefined && !data.name) throw new HttpError(422, "Nama wajib diisi");

  if (req.body.password) {
    if (!verifyPassword(String(req.body.currentPassword ?? ""), admin.password)) {
      throw new HttpError(422, "Password lama salah");
    }
    if (String(req.body.password).length < 6) throw new HttpError(422, "Password minimal 6 karakter");
    data.password = hashPassword(String(req.body.password));
  }
  if (!Object.keys(data).length) throw new HttpError(422, "Tidak ada perubahan");

  const updated = await sheets.update("Admins", admin.id, data);
  res.json({ ...publicAdmin(updated), role: auth.role, rt: auth.rt, rtId: auth.rt });
}));

app.delete("/api/admins/:id", requireSuperAdmin, wrap(async (req, res) => {
  await sheets.remove("Admins", req.params.id);
  res.json({ status: "deleted" });
}));

// ── Konfigurasi (super admin) ───────────────────────────────────────────────

app.get("/api/script-url", requireSuperAdmin, (_req, res) => {
  res.json({ url: getScriptUrl() });
});

app.post("/api/script-url", requireSuperAdmin, (req, res) => {
  const url = String(req.body.url ?? "").trim();
  if (!/^https:\/\/script\.google\.com\//.test(url)) {
    return res.status(422).json({ error: "URL harus berupa URL Web App Google Apps Script (https://script.google.com/...)" });
  }
  setScriptUrl(url);
  res.json({ message: "URL disimpan sementara. Untuk permanen, atur GOOGLE_SCRIPT_URL di environment." });
});

app.get("/api/vps-url", requireAdmin, (_req, res) => {
  res.json({ url: getVpsUrl() });
});

app.post("/api/vps-url", requireSuperAdmin, (req, res) => {
  const url = String(req.body.url ?? "").trim();
  if (!/^https?:\/\//.test(url)) return res.status(422).json({ error: "URL harus diawali http:// atau https://" });
  setVpsUrl(url);
  res.json({ message: "URL VPS disimpan sementara. Untuk permanen, atur VPS_WHATSAPP_URL di environment." });
});

// ── WhatsApp ────────────────────────────────────────────────────────────────
// Sesi bot hanya satu untuk seluruh aplikasi, jadi menyambung/memutus bot khusus super admin.
// Pengurus RT tetap bisa melihat status & broadcast ke warga RT-nya.

app.post("/api/whatsapp/start", requireSuperAdmin, wrap(async (req, res) => {
  let base = process.env.APP_URL;
  if (!base && req.headers.host) {
    const protocol = req.headers.host.includes("localhost") ? "http" : "https";
    base = `${protocol}://${req.headers.host}`;
  }
  res.json(await vpsFetch("/session/start", {
    method: "POST",
    body: { sessionId: getSessionId(req), webhookUrl: `${base}/api/whatsapp/webhook` },
  }));
}));

app.get("/api/whatsapp/status", requireAdmin, async (req, res) => {
  if (!getVpsUrl()) return res.json({ status: "close", qr: null });
  try {
    res.json(await vpsFetch(`/session/${getSessionId(req)}/status`));
  } catch (error: any) {
    res.json({ status: "error", qr: null, message: `Gagal terhubung ke VPS: ${error.message}` });
  }
});

app.post("/api/whatsapp/logout", requireSuperAdmin, wrap(async (req, res) => {
  res.json(await vpsFetch(`/session/${getSessionId(req)}/logout`, { method: "POST" }));
}));

/** Broadcast pesan bebas ke seluruh warga aktif di RT pengurus (mis. pengingat iuran). */
app.post("/api/whatsapp/broadcast", requireAdmin, wrap(async (req, res) => {
  const text = String(req.body.text ?? "").trim();
  if (text.length < 5) throw new HttpError(422, "Isi pesan terlalu pendek");
  const rt = targetRt(req, req.body.rt);
  const recipients = await residentPhonesInRt(rt);
  if (!recipients.length) throw new HttpError(422, "Belum ada warga dengan nomor WhatsApp di RT ini");
  res.status(202).json(await broadcastWa(req, recipients, text));
}));

// =============================================================================
// Error handler & frontend
// =============================================================================

app.use("/api", (_req, res) => {
  res.status(404).json({ error: "Endpoint tidak ditemukan" });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : err.status && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error("Unhandled error:", err);
  res.status(status).json({ error: status >= 500 ? `Terjadi kesalahan server: ${err.message}` : err.message });
});

if (process.env.NODE_ENV !== "production") {
  import("vite").then(async ({ createServer: createViteServer }) => {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
    const PORT = Number(process.env.PORT) || 3000;
    app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
  });
} else if (!process.env.VERCEL) {
  // Production di server biasa (bukan Vercel): sajikan hasil build React
  const clientBuildPath = path.join(__dirname, "dist");
  if (fs.existsSync(clientBuildPath)) {
    app.use(express.static(clientBuildPath));
    app.get("*", (_req, res) => res.sendFile(path.join(clientBuildPath, "index.html")));
  }
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on port ${PORT}`));
}

export default app;
