import React, { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, ShieldCheck, X } from "lucide-react";

interface Admin {
  id: number;
  username: string;
  name: string;
  rtId: string;
  role: string;
  phone?: string;
}

const emptyForm = { username: "", name: "", rtId: "", role: "admin", phone: "", password: "" };

/** Kelola akun pengurus RT (khusus super admin). */
export function AdminManager() {
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch('/api/admins');
    const data = await res.json().catch(() => []);
    setAdmins(res.ok && Array.isArray(data) ? data : []);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError("");
    setIsOpen(true);
  };

  const openEdit = (a: Admin) => {
    setEditingId(a.id);
    setForm({ username: a.username || "", name: a.name || "", rtId: a.rtId || "", role: a.role || "admin", phone: String(a.phone || ""), password: "" });
    setError("");
    setIsOpen(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    const res = await fetch(editingId ? `/api/admins/${editingId}` : '/api/admins', {
      method: editingId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Gagal menyimpan.");
      return;
    }
    setIsOpen(false);
    load();
  };

  const remove = async (a: Admin) => {
    if (!confirm(`Hapus akun pengurus ${a.name} (${a.rtId})?`)) return;
    const res = await fetch(`/api/admins/${a.id}`, { method: 'DELETE' });
    if (res.ok) load();
    else alert((await res.json().catch(() => ({}))).error || "Gagal menghapus.");
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <ShieldCheck className="text-indigo-600" size={24} />
          Pengurus RT
        </h3>
        <button onClick={openCreate} className="flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
          <Plus size={16} /> Tambah Pengurus
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-500">Kode RT</th>
              <th className="px-4 py-3 font-medium text-slate-500">Nama</th>
              <th className="px-4 py-3 font-medium text-slate-500">No. WA</th>
              <th className="px-4 py-3 font-medium text-slate-500">Peran</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {admins.map(a => (
              <tr key={a.id}>
                <td className="px-4 py-3 font-mono font-medium">{a.rtId}</td>
                <td className="px-4 py-3">{a.name}</td>
                <td className="px-4 py-3 text-slate-500">{a.phone || "-"}</td>
                <td className="px-4 py-3 text-slate-500">{a.role === 'superadmin' ? 'Super admin' : 'Pengurus'}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(a)} className="p-1.5 rounded text-slate-500 hover:bg-slate-100" title="Ubah"><Pencil size={16} /></button>
                  <button onClick={() => remove(a)} className="p-1.5 rounded text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {admins.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada pengurus.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-400">Nomor WA pengurus dipakai untuk notifikasi laporan, permohonan surat, dan pendaftaran warga baru.</p>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">{editingId ? 'Ubah Pengurus' : 'Tambah Pengurus'}</h3>
              <button onClick={() => setIsOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={submit} className="p-6 space-y-4">
              {error && <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">{error}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Kode RT</label>
                  {/* Tanpa toUpperCase() saat mengetik (merusak input di keyboard HP); server menormalkan ke huruf besar */}
                  <input required value={form.rtId} onChange={e => setForm({ ...form, rtId: e.target.value })} autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false} placeholder="RT01" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono uppercase" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Peran</label>
                  <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="admin">Pengurus RT</option>
                    <option value="superadmin">Super admin</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Nama</label>
                <input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Bpk. Ahmad (Ketua RT 01)" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Nomor WhatsApp</label>
                <input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="08xxxxxxxxxx" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Password {editingId && <span className="font-normal text-slate-400">(kosongkan jika tidak diubah)</span>}</label>
                <input type="password" required={!editingId} minLength={6} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setIsOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg">Batal</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
