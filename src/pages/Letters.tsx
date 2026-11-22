import React, { useState, useEffect } from "react";
import { FileText, Clock, Plus, X, Download, Trash2 } from "lucide-react";
import { Resident } from "@/types";
import { useAuth } from "@/context/AuthContext";

interface Letter {
  id: number;
  type: string;
  residentId: number | string;
  residentName: string;
  resident?: string;
  date: string;
  status: string;
  content?: string;
}

const LETTER_TYPES = [
  "Surat Pengantar KTP",
  "Surat Keterangan Domisili",
  "Surat Pengantar Nikah",
  "Surat Keterangan Tidak Mampu",
  "Surat Keterangan Usaha",
  "Surat Pengantar",
];
const STATUSES = ["Menunggu", "Proses", "Selesai", "Ditolak"];

const statusStyle = (status: string) => ({
  Selesai: "bg-green-100 text-green-700",
  Proses: "bg-blue-100 text-blue-700",
  Ditolak: "bg-red-100 text-red-700",
}[status] || "bg-amber-100 text-amber-700");

const emptyForm = { type: LETTER_TYPES[0], residentId: "", status: "Menunggu", content: "" };

export function Letters() {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const [lettersList, setLettersList] = useState<Letter[]>([]);
  const [residentsList, setResidentsList] = useState<Resident[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("Semua");
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newLetter, setNewLetter] = useState(emptyForm);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      try {
        const requests = [fetch('/api/letters')];
        if (isAdmin) requests.push(fetch('/api/residents'));
        const [resLetters, resResidents] = await Promise.all(requests);

        const letters = await resLetters.json();
        setLettersList(resLetters.ok && Array.isArray(letters) ? letters : []);

        if (resResidents) {
          const residents = await resResidents.json();
          setResidentsList(resResidents.ok && Array.isArray(residents)
            ? residents.filter((r: any) => !['Pindah', 'Meninggal'].includes(r.status) && r.verified !== 'pending')
            : []);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isAdmin]);

  const flash = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 5000);
  };

  const handleCreateLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setFormError("");
    try {
      const res = await fetch('/api/letters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLetter),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setLettersList([data, ...lettersList]);
        setIsCreateModalOpen(false);
        setNewLetter(emptyForm);
        flash(isAdmin ? "Surat berhasil dibuat." : "Permohonan surat terkirim. Pengurus RT akan memprosesnya.");
      } else {
        setFormError(data.error || "Gagal membuat surat.");
      }
    } catch (error) {
      setFormError("Terjadi kesalahan koneksi.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatus = async (letter: Letter, status: string) => {
    const res = await fetch(`/api/letters/${letter.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error || "Gagal mengubah status.");
      return;
    }
    setLettersList(prev => prev.map(l => l.id === letter.id ? data : l));
    setSelectedLetter(data);
    if (data.whatsapp?.ok) flash(status === 'Selesai' ? "Status diperbarui. PDF surat dikirim ke WhatsApp pemohon." : "Status diperbarui dan pemohon diberi tahu lewat WhatsApp.");
    else if (data.whatsapp) flash(`Status diperbarui, tetapi notifikasi WhatsApp gagal: ${data.whatsapp.reason}`);
  };

  const handleDownload = async (letter: Letter) => {
    const res = await fetch(`/api/letters/${letter.id}/pdf`);
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "Gagal mengunduh PDF.");
      return;
    }
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = `${letter.type.replace(/\s+/g, '_')}_${letter.residentName.replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (letter: Letter) => {
    if (!confirm(isAdmin ? "Hapus surat ini?" : "Batalkan permohonan surat ini?")) return;
    const res = await fetch(`/api/letters/${letter.id}`, { method: 'DELETE' });
    if (res.ok) {
      setLettersList(prev => prev.filter(l => l.id !== letter.id));
      setSelectedLetter(null);
    } else {
      alert((await res.json().catch(() => ({}))).error || "Gagal menghapus surat.");
    }
  };

  const visibleLetters = filter === "Semua" ? lettersList : lettersList.filter(l => l.status === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-2 flex-wrap">
          {["Semua", ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors ${filter === s ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'}`}
            >
              {s}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setNewLetter(emptyForm); setFormError(""); setIsCreateModalOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
        >
          <Plus size={18} />
          {isAdmin ? 'Buat Surat Baru' : 'Ajukan Surat'}
        </button>
      </div>

      {notice && <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">{notice}</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visibleLetters.map((letter) => (
          <div key={letter.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 rounded-lg bg-indigo-50 text-indigo-600">
                <FileText size={24} />
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle(letter.status)}`}>
                {letter.status}
              </span>
            </div>

            <h4 className="font-semibold text-slate-800 mb-1">{letter.type}</h4>
            <p className="text-sm text-slate-500 mb-4">Pemohon: {letter.residentName}</p>

            <div className="flex items-center justify-between text-xs text-slate-400 pt-4 border-t border-slate-100">
              <div className="flex items-center">
                <Clock size={14} className="mr-1" />
                {letter.date}
              </div>
              <button onClick={() => setSelectedLetter(letter)} className="text-indigo-600 hover:text-indigo-700 font-medium">
                Lihat Detail
              </button>
            </div>
          </div>
        ))}
        {!isLoading && visibleLetters.length === 0 && (
          <div className="col-span-full text-center text-slate-500 py-12">Belum ada surat.</div>
        )}
        {isLoading && <div className="col-span-full text-center text-slate-400 py-12">Memuat surat...</div>}
      </div>

      {/* Detail */}
      {selectedLetter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">Detail Surat</h3>
              <button onClick={() => setSelectedLetter(null)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-slate-900">{selectedLetter.type}</h4>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle(selectedLetter.status)}`}>{selectedLetter.status}</span>
                </div>
                <p className="text-sm text-slate-600 mb-1">Pemohon: <span className="font-medium text-slate-900">{selectedLetter.residentName}</span></p>
                <p className="text-sm text-slate-600">Tanggal: {selectedLetter.date}</p>
              </div>

              <div>
                <h5 className="text-sm font-medium text-slate-700 mb-2">Keterangan / Keperluan</h5>
                <div className="p-4 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 min-h-[80px] whitespace-pre-line">
                  {selectedLetter.content || "Tidak ada keterangan tambahan."}
                </div>
              </div>

              {isAdmin && (
                <div>
                  <h5 className="text-sm font-medium text-slate-700 mb-2">Ubah Status <span className="font-normal text-slate-400">(pemohon diberi tahu lewat WhatsApp)</span></h5>
                  <div className="flex flex-wrap gap-2">
                    {STATUSES.map(s => (
                      <button
                        key={s}
                        onClick={() => handleStatus(selectedLetter, s)}
                        disabled={selectedLetter.status === s}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${selectedLetter.status === s ? `${statusStyle(s)} border-transparent` : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 flex justify-between gap-2">
                {(isAdmin || selectedLetter.status === 'Menunggu') ? (
                  <button onClick={() => handleDelete(selectedLetter)} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={16} /> {isAdmin ? 'Hapus' : 'Batalkan'}
                  </button>
                ) : <span />}
                <div className="flex gap-2">
                  {(isAdmin || selectedLetter.status === 'Selesai') && (
                    <button onClick={() => handleDownload(selectedLetter)} className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50">
                      <Download size={16} /> Unduh PDF
                    </button>
                  )}
                  <button onClick={() => setSelectedLetter(null)} className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors">
                    Tutup
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Buat surat */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-lg font-semibold text-slate-800">{isAdmin ? 'Buat Surat Baru' : 'Ajukan Surat'}</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateLetter} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">{formError}</div>}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Jenis Surat</label>
                <select
                  required
                  value={newLetter.type}
                  onChange={e => setNewLetter({ ...newLetter, type: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {LETTER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Nama Pemohon</label>
                {isAdmin ? (
                  <select
                    required
                    value={newLetter.residentId}
                    onChange={e => setNewLetter({ ...newLetter, residentId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Pilih Warga</option>
                    {residentsList.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} - {r.nik}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" readOnly value={user?.name || ''} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 text-slate-500" />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Keterangan / Keperluan</label>
                <textarea
                  required
                  value={newLetter.content}
                  onChange={e => setNewLetter({ ...newLetter, content: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]"
                  placeholder="Contoh: Untuk pembuatan KTP baru"
                />
              </div>

              {isAdmin && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Status Awal</label>
                  <select
                    value={newLetter.status}
                    onChange={e => setNewLetter({ ...newLetter, status: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              <div className="pt-4 flex justify-end gap-3">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 disabled:opacity-70 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Menyimpan...' : isAdmin ? 'Buat Surat' : 'Kirim Permohonan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
