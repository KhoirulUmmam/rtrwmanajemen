import React, { useEffect, useState } from "react";
import { Megaphone, Send } from "lucide-react";

const TEMPLATES = [
  {
    label: "Pengingat iuran",
    text: "Assalamu'alaikum Bpk/Ibu warga yang kami hormati 🙏\n\nMengingatkan iuran warga bulan ini sebesar Rp ... dapat dibayarkan kepada bendahara RT paling lambat tanggal ...\n\nTerima kasih atas partisipasinya.",
  },
  {
    label: "Kerja bakti",
    text: "Mengundang seluruh warga untuk mengikuti kerja bakti pada:\n\n🗓 Hari/tanggal: ...\n⏰ Pukul: ...\n📍 Tempat: ...\n\nMohon membawa peralatan kebersihan masing-masing. Terima kasih.",
  },
];

/** Kirim pesan WhatsApp ke warga aktif di RT tertentu atau semua RT (khusus super admin). */
export function BroadcastCard({ disabled }: { disabled: boolean }) {
  const [text, setText] = useState("");
  const [rt, setRt] = useState("");
  const [rtOptions, setRtOptions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Daftar RT diambil dari akun pengurus yang terdaftar
  useEffect(() => {
    fetch('/api/admins')
      .then(r => (r.ok ? r.json() : []))
      .then((admins: any[]) => {
        const codes = [...new Set(admins.map(a => String(a.rtId || '').toUpperCase()).filter(c => c && c !== 'SUPERADMIN'))].sort();
        setRtOptions(codes);
      })
      .catch(() => setRtOptions([]));
  }, []);

  const targetLabel = rt === 'ALL' ? 'SEMUA warga di semua RT' : `semua warga ${rt}`;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rt) return;
    if (!confirm(`Kirim pesan ini ke WhatsApp ${targetLabel}?`)) return;
    setSending(true);
    setResult(null);
    const res = await fetch('/api/whatsapp/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, rt }),
    });
    const data = await res.json().catch(() => ({}));
    setSending(false);
    if (res.ok) {
      setResult({ ok: true, message: `Pesan sedang dikirim ke ${data.total} warga (bertahap, beberapa detik per pesan).` });
      setText("");
    } else {
      setResult({ ok: false, message: data.error || "Gagal mengirim broadcast." });
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <Megaphone className="text-green-600" size={24} />
        Broadcast WhatsApp ke Warga
      </h3>
      <p className="text-sm text-slate-500 mb-4">Untuk pengingat iuran, undangan kegiatan, atau info mendesak. Pengumuman resmi sebaiknya lewat menu Pengumuman.</p>

      <div className="flex flex-wrap gap-2 mb-3">
        {TEMPLATES.map(t => (
          <button key={t.label} type="button" onClick={() => setText(t.text)} className="px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50">
            Template: {t.label}
          </button>
        ))}
      </div>

      <form onSubmit={send} className="space-y-3">
        <select
          required
          value={rt}
          onChange={e => setRt(e.target.value)}
          className="w-full sm:w-64 px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">Pilih RT tujuan...</option>
          {rtOptions.map(code => <option key={code} value={code}>{code}</option>)}
          <option value="ALL">Semua RT</option>
        </select>
        <textarea
          required
          rows={6}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Tulis pesan... (*tebal*, _miring_ didukung WhatsApp)"
          className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {result && (
          <div className={`p-3 rounded-lg text-sm ${result.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{result.message}</div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-400">{disabled ? 'Bot WhatsApp belum terhubung.' : 'Dikirim dengan jeda acak untuk mengurangi risiko nomor bot diblokir.'}</p>
          <button type="submit" disabled={disabled || sending || !rt || text.trim().length < 5} className="flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send size={16} /> {sending ? 'Mengirim...' : rt === 'ALL' ? 'Kirim ke Semua RT' : rt ? `Kirim ke Warga ${rt}` : 'Kirim'}
          </button>
        </div>
      </form>
    </div>
  );
}
