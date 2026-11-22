import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { User, MapPin, Phone, CreditCard, Save, CheckCircle, Key, Lock, ShieldCheck } from "lucide-react";

const inputClass = "w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 focus:bg-white transition-colors";
const readOnlyClass = "w-full px-4 py-2.5 border border-slate-100 rounded-xl text-sm bg-slate-100 text-slate-500 cursor-not-allowed";

export function Profile() {
  const { role } = useAuth();
  return role === 'resident' ? <ResidentProfile /> : <AdminProfile />;
}

/** Profil pengurus RT / super admin: ubah nama, nomor WA, dan password sendiri. */
function AdminProfile() {
  const { user, updateUser, isSuperAdmin } = useAuth();
  const [formData, setFormData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", password: "", confirm: "" });

  useEffect(() => {
    if (!user) return;
    setFormData(user);
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(fresh => { if (fresh) setFormData(fresh); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (body: Record<string, unknown>, successText: string) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch('/api/account', {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFormData(data);
        updateUser({ ...user, name: data.name });
        setMessage(successText);
        setTimeout(() => setMessage(""), 4000);
        return true;
      }
      setError(data.error || "Gagal menyimpan perubahan.");
    } catch {
      setError("Terjadi kesalahan saat menyimpan data.");
    } finally {
      setIsLoading(false);
    }
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    save({ name: formData.name, phone: formData.phone }, "Profil berhasil diperbarui!");
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.password !== passwords.confirm) {
      setError("Konfirmasi password baru tidak sama.");
      return;
    }
    const ok = await save({ currentPassword: passwords.currentPassword, password: passwords.password }, "Password berhasil diganti!");
    if (ok) setPasswords({ currentPassword: "", password: "", confirm: "" });
  };

  if (!formData) return null;
  const envAccount = Boolean(formData.envAccount);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
            <ShieldCheck size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Profil Saya</h2>
            <p className="text-slate-500">{isSuperAdmin ? "Super Admin" : `Pengurus ${formData.rtId || formData.rt || ""}`}</p>
          </div>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}
        {message && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-100 text-sm flex items-center gap-2">
            <CheckCircle size={18} /> {message}
          </div>
        )}

        {envAccount ? (
          <p className="text-sm text-slate-600 flex items-start gap-2">
            <Lock size={16} className="text-slate-400 mt-0.5 shrink-0" />
            Akun super admin utama tidak disimpan di Google Sheet. Password-nya diatur lewat environment variable
            <code className="px-1 bg-slate-100 rounded">SUPERADMIN_PASSWORD</code> (Vercel → Settings → Environment Variables, lalu Redeploy).
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><User size={16} className="text-slate-400" /> Nama</label>
                <input type="text" required value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className={inputClass} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><Phone size={16} className="text-slate-400" /> Nomor WhatsApp</label>
                <input type="text" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputClass} placeholder="08xxxxxxxxxx" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Kode RT</label>
                <input type="text" readOnly value={formData.rtId || formData.rt || "-"} className={readOnlyClass} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Peran</label>
                <input type="text" readOnly value={isSuperAdmin ? "Super Admin" : "Pengurus RT"} className={readOnlyClass} />
              </div>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 -mt-2">
              <Lock size={12} /> Kode RT dan peran hanya dapat diubah oleh super admin.
            </p>
            <div className="pt-6 border-t border-slate-100 flex justify-end">
              <button type="submit" disabled={isLoading} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 disabled:opacity-70">
                <Save size={18} />
                {isLoading ? "Menyimpan..." : "Simpan Perubahan"}
              </button>
            </div>
          </form>
        )}
      </div>

      {!envAccount && (
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-6"><Key size={20} className="text-indigo-500" /> Ganti Password</h3>
          <form onSubmit={handlePassword} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input type="password" required placeholder="Password lama" autoComplete="current-password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} className={inputClass} />
            <input type="password" required minLength={6} placeholder="Password baru (min. 6)" autoComplete="new-password" value={passwords.password} onChange={(e) => setPasswords({ ...passwords, password: e.target.value })} className={inputClass} />
            <input type="password" required minLength={6} placeholder="Ulangi password baru" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className={inputClass} />
            <div className="md:col-span-3 flex justify-end">
              <button type="submit" disabled={isLoading} className="px-6 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 disabled:opacity-70">Ganti Password</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ResidentProfile() {
  const { user, updateUser } = useAuth();
  const [formData, setFormData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({ currentPassword: "", password: "", confirm: "" });

  // Ambil data terbaru dari server (bukan hanya dari localStorage)
  useEffect(() => {
    if (!user) return;
    setFormData(user);
    fetch('/api/auth/me')
      .then(res => (res.ok ? res.json() : null))
      .then(fresh => {
        if (fresh) {
          setFormData(fresh);
          updateUser({ ...user, ...fresh });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async (body: Record<string, unknown>, successText: string) => {
    setIsLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/residents/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setFormData(data);
        updateUser({ ...user, ...data });
        setMessage(successText);
        setTimeout(() => setMessage(""), 4000);
        return true;
      }
      setError(data.error || "Gagal menyimpan perubahan.");
    } catch (err) {
      setError("Terjadi kesalahan saat menyimpan data.");
    } finally {
      setIsLoading(false);
    }
    return false;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const { phone, address, gender, maritalStatus, familyRelationship, familyCardNumber } = formData;
    save({ phone, address, gender, maritalStatus, familyRelationship, familyCardNumber }, "Profil berhasil diperbarui!");
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.password !== passwords.confirm) {
      setError("Konfirmasi password baru tidak sama.");
      return;
    }
    const ok = await save({ currentPassword: passwords.currentPassword, password: passwords.password }, "Password berhasil diganti!");
    if (ok) setPasswords({ currentPassword: "", password: "", confirm: "" });
  };

  if (!formData) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4 mb-8 pb-6 border-b border-slate-100">
          <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center">
            <User size={32} />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-800">Profil Saya</h2>
            <p className="text-slate-500">Lengkapi dan perbarui data diri Anda</p>
          </div>
        </div>

        {error && <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 text-sm">{error}</div>}
        {message && (
          <div className="mb-6 p-4 bg-green-50 text-green-700 rounded-lg border border-green-100 text-sm flex items-center gap-2">
            <CheckCircle size={18} /> {message}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identitas: hanya bisa diubah pengurus */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><User size={16} className="text-slate-400" /> Nama Lengkap</label>
              <input type="text" readOnly value={formData.name || ""} className={readOnlyClass} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><CreditCard size={16} className="text-slate-400" /> NIK</label>
              <input type="text" readOnly value={formData.nik || ""} className={readOnlyClass} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">RT / RW</label>
              <input type="text" readOnly value={`${formData.rt || "-"} / ${formData.rw || "-"}`} className={readOnlyClass} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Status Warga</label>
              <input type="text" readOnly value={formData.status || "-"} className={readOnlyClass} />
            </div>
          </div>
          <p className="text-xs text-slate-400 flex items-center gap-1.5 -mt-2">
            <Lock size={12} /> Nama, NIK, RT/RW, dan status warga hanya dapat diubah oleh pengurus RT.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><Phone size={16} className="text-slate-400" /> Nomor WhatsApp</label>
              <input type="text" value={formData.phone || ""} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className={inputClass} placeholder="08xxxxxxxxxx" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><CreditCard size={16} className="text-slate-400" /> Nomor Kartu Keluarga</label>
              <input type="text" inputMode="numeric" value={formData.familyCardNumber || ""} onChange={(e) => setFormData({ ...formData, familyCardNumber: e.target.value.replace(/\D/g, '') })} className={inputClass} placeholder="16 digit" />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-2"><MapPin size={16} className="text-slate-400" /> Alamat Lengkap</label>
              <textarea required rows={3} value={formData.address || ""} onChange={(e) => setFormData({ ...formData, address: e.target.value })} className={inputClass} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Jenis Kelamin</label>
              <select value={formData.gender || ""} onChange={(e) => setFormData({ ...formData, gender: e.target.value })} className={inputClass}>
                <option value="">Pilih</option>
                <option value="Laki-laki">Laki-laki</option>
                <option value="Perempuan">Perempuan</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Status Pernikahan</label>
              <select value={formData.maritalStatus || ""} onChange={(e) => setFormData({ ...formData, maritalStatus: e.target.value })} className={inputClass}>
                <option value="">Pilih</option>
                <option value="Lajang">Lajang</option>
                <option value="Menikah">Menikah</option>
                <option value="Janda">Janda</option>
                <option value="Duda">Duda</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Hubungan Keluarga</label>
              <select value={formData.familyRelationship || ""} onChange={(e) => setFormData({ ...formData, familyRelationship: e.target.value })} className={inputClass}>
                <option value="">Pilih</option>
                <option value="Kepala Keluarga">Kepala Keluarga</option>
                <option value="Istri">Istri</option>
                <option value="Anak">Anak</option>
                <option value="Famili Lain">Famili Lain</option>
              </select>
            </div>
          </div>

          <div className="pt-6 border-t border-slate-100 flex justify-end">
            <button type="submit" disabled={isLoading} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm shadow-indigo-200 disabled:opacity-70">
              <Save size={18} />
              {isLoading ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2 mb-6"><Key size={20} className="text-indigo-500" /> Ganti Password</h3>
        <form onSubmit={handlePassword} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="password" required placeholder="Password lama" autoComplete="current-password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} className={inputClass} />
          <input type="password" required minLength={6} placeholder="Password baru (min. 6)" autoComplete="new-password" value={passwords.password} onChange={(e) => setPasswords({ ...passwords, password: e.target.value })} className={inputClass} />
          <input type="password" required minLength={6} placeholder="Ulangi password baru" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} className={inputClass} />
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" disabled={isLoading} className="px-6 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 disabled:opacity-70">Ganti Password</button>
          </div>
        </form>
      </div>
    </div>
  );
}
