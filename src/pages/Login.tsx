import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Shield, User, Key, ArrowRight, MapPin, Phone, UserPlus } from 'lucide-react';

export function Login() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [loginType, setLoginType] = useState<'admin' | 'resident'>('resident');
  const [nik, setNik] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [rtCode, setRtCode] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setSession } = useAuth();
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!rtCode.trim() || !nik.trim() || !name.trim() || !phone.trim() || !password.trim()) {
      setError('Semua kolom harus diisi.');
      return;
    }
    if (!/^\d{16}$/.test(nik.trim())) {
      setError('NIK harus 16 digit angka.');
      return;
    }
    if (password.length < 6) {
      setError('Password minimal 6 karakter.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rtCode, nik: nik.trim(), name, phone, password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setSuccessMsg(data.message || 'Pendaftaran berhasil. Akun aktif setelah diverifikasi pengurus RT.');
        setIsRegistering(false);
        setName('');
        setPhone('');
        setPassword('');
      } else {
        setError(data.error || 'Gagal mendaftar. Silakan coba lagi.');
      }
    } catch (err) {
      setError('Terjadi kesalahan saat mendaftar. Periksa koneksi Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');

    if (!rtCode.trim()) {
      setError('Kode RT harus diisi.');
      return;
    }

    setIsLoading(true);
    try {
      // Pengecekan password dilakukan di server; browser tidak pernah menerima data password
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: loginType, rtCode, nik: nik.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.token) {
        setSession(data.token, data.user);
        navigate('/');
      } else {
        setError(data.error || 'Login gagal. Periksa kembali data Anda.');
      }
    } catch (err) {
      console.error("Login error:", err);
      setError('Terjadi kesalahan saat login. Periksa koneksi Anda.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-indigo-900 via-slate-900 to-black p-12 flex-col justify-between">
        <div className="absolute top-0 left-0 w-full h-full bg-[url('https://picsum.photos/seed/cityscape/1920/1080?blur=4')] opacity-20 bg-cover bg-center mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent"></div>
        
        <div className="relative z-10">
          <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 mb-6 shadow-2xl">
            <Shield className="text-indigo-400" size={24} />
          </div>
          <h1 className="text-5xl font-bold text-white tracking-tight leading-tight mb-4">
            Sistem Informasi<br/>Manajemen Warga
          </h1>
          <p className="text-lg text-indigo-200/80 max-w-md font-light">
            Platform digital terpadu untuk pengelolaan administrasi, keuangan, dan komunikasi warga tingkat RT/RW.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-sm text-slate-400 font-mono uppercase tracking-wider">
          <span>&copy; {new Date().getFullYear()} RT 01 / RW 05</span>
          <span className="w-1 h-1 bg-slate-600 rounded-full"></span>
          <span>Kelurahan Sukamaju</span>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 sm:p-12 bg-white relative">
        <div className="w-full max-w-md space-y-8">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
              {isRegistering ? 'Daftar Warga Baru' : 'Selamat Datang'}
            </h2>
            <p className="text-slate-500 mt-2">
              {isRegistering ? 'Lengkapi data di bawah ini untuk mendaftar.' : 'Silakan masuk ke akun Anda untuk melanjutkan.'}
            </p>
          </div>
          
          {!isRegistering && (
            <div className="flex bg-slate-100/80 p-1.5 rounded-xl">
              <button
                type="button"
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  loginType === 'resident' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
                onClick={() => { setLoginType('resident'); setError(''); setSuccessMsg(''); }}
              >
                Warga
              </button>
              <button
                type="button"
                className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${
                  loginType === 'admin' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                }`}
                onClick={() => { setLoginType('admin'); setError(''); setSuccessMsg(''); }}
              >
                Pengurus RT
              </button>
            </div>
          )}

          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm font-medium rounded-xl border border-red-100 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <Shield className="shrink-0 mt-0.5" size={16} />
                {error}
              </div>
            )}

            {successMsg && (
              <div className="p-4 bg-green-50 text-green-600 text-sm font-medium rounded-xl border border-green-100 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <Shield className="shrink-0 mt-0.5" size={16} />
                {successMsg}
              </div>
            )}

            <div className="space-y-2.5">
              <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <MapPin size={16} className="text-indigo-500" />
                Kode RT (Workspace)
              </label>
              <input
                type="text"
                required
                value={rtCode}
                // Jangan toUpperCase() di sini: di keyboard HP (Gboard dkk.) mengubah teks saat
                // mengetik merusak kata yang sedang disusun, sehingga "RT" hilang saat mengetik "01".
                // Huruf besar cukup lewat CSS `uppercase`; server sudah menormalkan kode RT.
                onChange={(e) => setRtCode(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all font-mono uppercase"
                placeholder="Contoh: RT01"
              />
            </div>

            {isRegistering ? (
              <>
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <User size={16} className="text-indigo-500" />
                    Nomor Induk Kependudukan (NIK)
                  </label>
                  <input
                    type="text"
                    required
                    value={nik}
                    onChange={(e) => setNik(e.target.value)}
                    className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all font-mono"
                    placeholder="Masukkan 16 digit NIK"
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <UserPlus size={16} className="text-indigo-500" />
                    Nama Lengkap
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all"
                    placeholder="Nama sesuai KTP"
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Phone size={16} className="text-indigo-500" />
                    Nomor WhatsApp
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all font-mono"
                    placeholder="Contoh: 08123456789"
                  />
                </div>
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Key size={16} className="text-indigo-500" />
                    Buat Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all font-mono tracking-widest"
                    placeholder="Minimal 6 karakter"
                  />
                </div>
              </>
            ) : loginType === 'resident' ? (
              <>
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <User size={16} className="text-indigo-500" />
                    Nomor Induk Kependudukan (NIK)
                  </label>
                  <input
                    type="text"
                    required
                    value={nik}
                    onChange={(e) => setNik(e.target.value)}
                    className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all font-mono"
                    placeholder="Masukkan 16 digit NIK"
                  />
                  <p className="text-xs text-slate-500 font-medium">Gunakan NIK yang terdaftar di database RT.</p>
                </div>
                <div className="space-y-2.5">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                    <Key size={16} className="text-indigo-500" />
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all font-mono tracking-widest"
                    placeholder="••••••••"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2.5">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Key size={16} className="text-indigo-500" />
                  Password Administrator
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 focus:bg-white transition-all font-mono tracking-widest"
                  placeholder="••••••••"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-4 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed hover:-translate-y-0.5 active:translate-y-0"
            >
              {isLoading ? 'Memproses...' : isRegistering ? 'Daftar Sekarang' : 'Masuk ke Sistem'}
              {!isLoading && <ArrowRight size={18} />}
            </button>
          </form>
          
          <div className="text-center mt-6">
            <button 
              type="button"
              onClick={() => {
                setIsRegistering(!isRegistering);
                setError('');
                setSuccessMsg('');
                setLoginType('resident');
              }}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
            >
              {isRegistering 
                ? "Sudah punya akun? Masuk di sini" 
                : "Belum terdaftar? Daftar sebagai warga baru"}
            </button>
          </div>

          <div className="lg:hidden text-center mt-12">
            <p className="text-xs text-slate-400 font-mono uppercase tracking-wider">
              &copy; {new Date().getFullYear()} RT 01 / RW 05
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
