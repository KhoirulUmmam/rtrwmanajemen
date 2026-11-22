import React, { useState, useEffect } from "react";
import { Plus, Search, Filter, AlertCircle, CheckCircle, Clock, X, FileText, User, MessageSquare, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "motion/react";

interface Report {
  id: number;
  residentId: number | string;
  residentName: string;
  title: string;
  description: string;
  date: string;
  status: string;
  image?: string; // Add image property
}

export function Reports() {
  const { role, user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("Semua");
  const [loading, setLoading] = useState(true);

  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    fetchReports();
  }, [role, user]);

  const fetchReports = async () => {
    try {
      const response = await fetch('/api/reports');
      if (!response.ok) throw new Error('Network response was not ok');
      const data = await response.json();
      
      if (Array.isArray(data)) {
        // Server sudah membatasi: pengurus melihat laporan RT-nya, warga hanya laporannya sendiri
        setReports(data);
      } else {
        console.error("Data is not an array:", data);
        setReports([]);
      }
    } catch (error) {
      console.error("Failed to fetch reports:", error);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setFormError("");
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description }),
      });
      if (response.ok) {
        fetchReports();
        setIsAddModalOpen(false);
        setTitle("");
        setDescription("");
      } else {
        setFormError((await response.json().catch(() => ({}))).error || "Gagal mengirim laporan.");
      }
    } catch (error) {
      setFormError("Terjadi kesalahan koneksi.");
    }
  };

  const handleUpdateStatus = async (id: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/reports/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        fetchReports();
        if (selectedReport) setSelectedReport({ ...selectedReport, status: newStatus });
        setNote("");
        if (data.whatsapp?.ok) setNotice("Status diperbarui dan pelapor diberi tahu lewat WhatsApp.");
        else if (data.whatsapp) setNotice(`Status diperbarui, tetapi WhatsApp gagal: ${data.whatsapp.reason}`);
        else setNotice("Status diperbarui.");
        setTimeout(() => setNotice(""), 5000);
      } else {
        alert(data.error || "Gagal mengubah status.");
      }
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const handleDelete = async (report: Report) => {
    if (!confirm("Hapus laporan ini?")) return;
    const response = await fetch(`/api/reports/${report.id}`, { method: 'DELETE' });
    if (response.ok) {
      setReports(prev => prev.filter(r => r.id !== report.id));
      setIsDetailModalOpen(false);
    } else {
      alert((await response.json().catch(() => ({}))).error || "Gagal menghapus laporan.");
    }
  };

  const filteredReports = reports.filter(report => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = String(report.title).toLowerCase().includes(q) ||
                          String(report.residentName).toLowerCase().includes(q) ||
                          String(report.description).toLowerCase().includes(q);
    const matchesStatus = filterStatus === "Semua" || report.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Selesai': return 'bg-green-100 text-green-700 border-green-200';
      case 'Diproses': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Ditolak': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-amber-100 text-amber-700 border-amber-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Selesai': return <CheckCircle size={16} />;
      case 'Ditolak': return <AlertCircle size={16} />;
      default: return <Clock size={16} />;
    }
  };

  const isWhatsAppReport = (title: string) => title.startsWith('[WA]');

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Laporan Warga</h1>
          <p className="text-slate-500 text-sm mt-1">
            {role === 'admin' ? 'Kelola laporan dan keluhan dari warga (web & WhatsApp)' : 'Laporan yang Anda kirim lewat web atau WhatsApp (ketik LAPOR ... ke nomor bot)'}
          </p>
        </div>
        {role === 'resident' && (
          <button
            onClick={() => { setFormError(""); setIsAddModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200"
          >
            <Plus size={18} /> Buat Laporan
          </button>
        )}
      </div>

      {notice && <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-sm text-green-700">{notice}</div>}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Cari laporan..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="text-slate-400" size={20} />
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-slate-200 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          >
            <option value="Semua">Semua Status</option>
            <option value="Menunggu">Menunggu</option>
            <option value="Diproses">Diproses</option>
            <option value="Selesai">Selesai</option>
            <option value="Ditolak">Ditolak</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredReports.map((report) => (
          <div 
            key={report.id} 
            onClick={() => {
              setSelectedReport(report);
              setIsDetailModalOpen(true);
            }}
            className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:border-indigo-200 hover:shadow-md transition-all cursor-pointer flex flex-col h-full relative overflow-hidden"
          >
            {isWhatsAppReport(report.title) && (
              <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg flex items-center gap-1">
                <MessageSquare size={12} /> WhatsApp
              </div>
            )}

            <div className="flex justify-between items-start mb-4 mt-2">
              <div className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${getStatusColor(report.status)}`}>
                {getStatusIcon(report.status)}
                {report.status}
              </div>
              <span className="text-xs text-slate-400 font-medium">{report.date}</span>
            </div>
            
            <h3 className="text-lg font-bold text-slate-800 mb-2 line-clamp-2">
              {isWhatsAppReport(report.title) ? report.title.replace('[WA] ', '') : report.title}
            </h3>
            
            <p className="text-slate-600 text-sm line-clamp-3 mb-4 flex-1 whitespace-pre-line">
              {report.description}
            </p>
            
            <div className="pt-4 border-t border-slate-100 flex items-center justify-between mt-auto">
              <span className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <User size={14} className="text-slate-400" />
                {report.residentName}
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedReport(report);
                  setIsDetailModalOpen(true);
                }}
                className="text-indigo-600 text-sm font-medium hover:text-indigo-700 flex items-center gap-1"
              >
                Detail <AlertCircle size={14} />
              </button>
            </div>
          </div>
        ))}
        
        {filteredReports.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-500 bg-white rounded-xl border border-slate-100 border-dashed">
            <FileText size={48} className="mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-600">Tidak ada laporan ditemukan</p>
            <p className="text-sm">Coba ubah filter atau kata kunci pencarian Anda.</p>
          </div>
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">Buat Laporan</h2>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">{formError}</div>}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Judul</label>
                <input required value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Lampu jalan mati" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Detail laporan</label>
                <textarea required rows={4} value={description} onChange={e => setDescription(e.target.value)} placeholder="Jelaskan lokasi dan masalahnya..." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <p className="text-xs text-slate-400">Ingin melampirkan foto? Kirim lewat WhatsApp bot RT dengan caption <strong>LAPOR ...</strong></p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 rounded-lg">Batal</button>
                <button type="submit" className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">Kirim Laporan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <AnimatePresence>
        {isDetailModalOpen && selectedReport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex justify-between items-center p-6 border-b border-slate-100">
                <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                  Detail Laporan
                  {isWhatsAppReport(selectedReport.title) && (
                    <span className="bg-green-100 text-green-700 text-xs font-bold px-2 py-1 rounded-md flex items-center gap-1">
                      <MessageSquare size={12} /> via WhatsApp
                    </span>
                  )}
                </h2>
                <button onClick={() => setIsDetailModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto">
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-xl font-bold text-slate-800">
                        {isWhatsAppReport(selectedReport.title) ? selectedReport.title.replace('[WA] ', '') : selectedReport.title}
                      </h3>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1.5 ${getStatusColor(selectedReport.status)}`}>
                        {getStatusIcon(selectedReport.status)}
                        {selectedReport.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-500">
                      <span className="flex items-center gap-1"><Clock size={14} /> {selectedReport.date}</span>
                      <span className="flex items-center gap-1"><User size={14} /> {selectedReport.residentName}</span>
                    </div>
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-slate-700 mb-2">Deskripsi Laporan:</h4>
                    <div className="bg-slate-50 p-4 rounded-xl text-slate-700 text-sm leading-relaxed border border-slate-100 whitespace-pre-wrap">
                      {selectedReport.description}
                    </div>
                  </div>

                  {selectedReport.image && /^https?:\/\//.test(selectedReport.image) && (
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Foto Lampiran:</h4>
                      <a href={selectedReport.image} target="_blank" rel="noopener noreferrer">
                        <img src={selectedReport.image} alt="Foto laporan" className="w-full max-h-80 object-contain rounded-xl border border-slate-100 bg-slate-50" />
                      </a>
                    </div>
                  )}

                  {role === 'admin' && (
                    <div className="pt-6 border-t border-slate-100">
                      <h4 className="text-sm font-medium text-slate-700 mb-3">Update Status Laporan <span className="font-normal text-slate-400">(pelapor diberi tahu lewat WhatsApp)</span></h4>
                      <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={2}
                        placeholder="Catatan untuk pelapor (opsional), mis. 'Sudah diperbaiki petugas PLN'"
                        className="w-full mb-3 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <div className="flex flex-wrap gap-2">
                        {['Menunggu', 'Diproses', 'Selesai', 'Ditolak'].map((status) => (
                          <button
                            key={status}
                            onClick={() => handleUpdateStatus(selectedReport.id, status)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                              selectedReport.status === status 
                                ? getStatusColor(status)
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => handleDelete(selectedReport)} className="mt-6 flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700">
                        <Trash2 size={16} /> Hapus laporan
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
