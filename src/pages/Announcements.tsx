import React, { useState, useEffect } from "react";
import { Bell, Calendar, Plus, X, Pencil, Trash2, Send } from "lucide-react";
import { Announcement } from "@/types";
import { useAuth } from "@/context/AuthContext";
import { BroadcastCard } from "@/components/settings/BroadcastCard";

const emptyForm = { title: "", content: "", broadcast: true };

export function Announcements() {
  const { role, isSuperAdmin } = useAuth();
  // Broadcast WA hanya untuk pengurus RT (super admin tidak terikat satu RT)
  const canBroadcast = role === 'admin' && !isSuperAdmin;
  const [waOpen, setWaOpen] = useState(false);
  const [announcementsList, setAnnouncementsList] = useState<Announcement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  const fetchData = async () => {
    try {
      const res = await fetch('/api/announcements');
      const data = await res.json();
      setAnnouncementsList(res.ok && Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch announcements:", error);
      setAnnouncementsList([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!canBroadcast) return;
    fetch('/api/whatsapp/status')
      .then((r) => r.json())
      .then((s) => setWaOpen(s?.status === 'open'))
      .catch(() => setWaOpen(false));
  }, [canBroadcast]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 5000);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setIsModalOpen(true);
  };

  const openEdit = (a: Announcement) => {
    setEditingId(a.id);
    setForm({ title: a.title, content: a.content, broadcast: false });
    setFormError("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError("");
    try {
      const res = await fetch(editingId ? `/api/announcements/${editingId}` : '/api/announcements', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || "Gagal menyimpan pengumuman.");
        return;
      }

      setAnnouncementsList(prev => editingId ? prev.map(a => a.id === editingId ? data : a) : [data, ...prev]);
      setIsModalOpen(false);

      if (data.broadcast?.status === 'queued') flash(`Pengumuman disimpan dan sedang dikirim ke ${data.broadcast.total} warga lewat WhatsApp.`);
      else if (data.broadcast?.status === 'error') flash(`Pengumuman disimpan, tetapi gagal dikirim ke WhatsApp: ${data.broadcast.error}`);
      else flash("Pengumuman disimpan.");
    } catch (error) {
      setFormError("Terjadi kesalahan koneksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (a: Announcement) => {
    if (!confirm(`Hapus pengumuman "${a.title}"?`)) return;
    const res = await fetch(`/api/announcements/${a.id}`, { method: 'DELETE' });
    if (res.ok) setAnnouncementsList(prev => prev.filter(x => x.id !== a.id));
    else alert((await res.json().catch(() => ({}))).error || "Gagal menghapus.");
  };

  const handleBroadcast = async (a: Announcement) => {
    if (!confirm(`Kirim ulang "${a.title}" ke WhatsApp semua warga?`)) return;
    const res = await fetch(`/api/announcements/${a.id}/broadcast`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (res.ok) flash(data.total ? `Sedang dikirim ke ${data.total} warga.` : "Tidak ada warga dengan nomor WhatsApp.");
    else alert(data.error || "Gagal mengirim ke WhatsApp.");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">Daftar Pengumuman</h2>
        {role === 'admin' && (
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
          >
            <Plus size={18} />
            Buat Pengumuman
          </button>
        )}
      </div>

      {notice && (
        <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">{notice}</div>
      )}

      {canBroadcast && <BroadcastCard disabled={!waOpen} />}

      <div className="grid gap-4">
        {isLoading && <p className="text-center text-slate-400 py-8">Memuat pengumuman...</p>}
        {announcementsList.map((announcement) => (
          <div key={announcement.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-4 min-w-0">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg h-fit">
                  <Bell size={24} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-800 text-lg">{announcement.title}</h3>
                  <div className="flex items-center text-sm text-slate-500 mt-1 mb-3">
                    <Calendar size={14} className="mr-1" />
                    {announcement.date}
                  </div>
                  <p className="text-slate-600 leading-relaxed whitespace-pre-line">{announcement.content}</p>
                </div>
              </div>
              {role === 'admin' && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => handleBroadcast(announcement)} className="p-2 rounded-lg text-green-600 hover:bg-green-50" title="Kirim ke WhatsApp warga">
                    <Send size={18} />
                  </button>
                  <button onClick={() => openEdit(announcement)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100" title="Ubah">
                    <Pencil size={18} />
                  </button>
                  <button onClick={() => handleDelete(announcement)} className="p-2 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600" title="Hapus">
                    <Trash2 size={18} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        {!isLoading && announcementsList.length === 0 && (
          <p className="text-center text-slate-500 py-8">Belum ada pengumuman.</p>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">{editingId ? 'Ubah Pengumuman' : 'Buat Pengumuman Baru'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">{formError}</div>}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Judul Pengumuman</label>
                <input
                  type="text"
                  required
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Contoh: Kerja Bakti Minggu Ini"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Isi Pengumuman</label>
                <textarea
                  required
                  rows={5}
                  value={form.content}
                  onChange={e => setForm({ ...form, content: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="Tuliskan detail pengumuman di sini..."
                />
              </div>

              {!editingId && (
                <label className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-lg cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.broadcast}
                    onChange={e => setForm({ ...form, broadcast: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-green-800">
                    <span className="font-medium">Kirim juga ke WhatsApp semua warga</span><br />
                    <span className="text-green-700/80">Dikirim bertahap dengan jeda beberapa detik per warga.</span>
                  </span>
                </label>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Pengumuman'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
