import { Bell, User, UserCircle, Settings, LogOut, ChevronDown, CheckCheck } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState, useCallback, type RefObject } from "react";

interface Notif {
  key: string;
  title: string;
  detail: string;
  to: string;
}

const asArray = async (res: Response) => {
  const data = await res.json().catch(() => []);
  return res.ok && Array.isArray(data) ? data : [];
};

const safeGet = (key: string) => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } };
const safeSet = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* abaikan */ } };

/** Tutup dropdown saat klik di luar elemen. */
function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [ref, onOutside]);
}

/**
 * Notifikasi:
 * - Pengurus/super admin: hal yang perlu ditindaklanjuti (pendaftar baru, surat & laporan berstatus Menunggu).
 * - Warga: perubahan status surat/laporan miliknya dan pengumuman baru sejak terakhir dibuka.
 */
function useNotifications(role: string | null, user: any) {
  const [items, setItems] = useState<Notif[]>([]);
  const snapshotRef = useRef<unknown>(null);
  const seenKey = user ? `notif_seen_${user.role}_${user.id}` : '';

  const load = useCallback(async () => {
    if (!role || !user) return;
    try {
      if (role === 'admin') {
        const [res, let_, rep] = await Promise.all([fetch('/api/residents'), fetch('/api/letters'), fetch('/api/reports')]);
        const [residents, letters, reports] = await Promise.all([asArray(res), asArray(let_), asArray(rep)]);
        const pendingResidents = residents.filter((r: any) => r.verified === 'pending');
        const waitingLetters = letters.filter((l: any) => l.status === 'Menunggu');
        const waitingReports = reports.filter((r: any) => r.status === 'Menunggu');
        const list: Notif[] = [];
        if (pendingResidents.length) list.push({
          key: 'residents', to: '/residents',
          title: `${pendingResidents.length} pendaftar warga baru`,
          detail: `Menunggu verifikasi: ${pendingResidents.slice(0, 2).map((r: any) => r.name).join(', ')}${pendingResidents.length > 2 ? ', …' : ''}`,
        });
        if (waitingLetters.length) list.push({
          key: 'letters', to: '/letters',
          title: `${waitingLetters.length} permohonan surat baru`,
          detail: `Terbaru: ${waitingLetters[waitingLetters.length - 1].type} – ${waitingLetters[waitingLetters.length - 1].residentName || ''}`,
        });
        if (waitingReports.length) list.push({
          key: 'reports', to: '/reports',
          title: `${waitingReports.length} laporan warga masuk`,
          detail: `Terbaru: ${waitingReports[waitingReports.length - 1].title}`,
        });
        setItems(list);
        return;
      }

      // Warga
      const [let_, rep, ann] = await Promise.all([fetch('/api/letters'), fetch('/api/reports'), fetch('/api/announcements')]);
      const [letters, reports, announcements] = await Promise.all([asArray(let_), asArray(rep), asArray(ann)]);
      const mine = (rows: any[]) => rows.filter((r) => !r.residentId || String(r.residentId) === String(user.id));
      const snapshot = {
        letters: Object.fromEntries(mine(letters).map((l: any) => [l.id, l.status])),
        reports: Object.fromEntries(mine(reports).map((r: any) => [r.id, r.status])),
        ann: Math.max(0, ...announcements.map((a: any) => Number(a.id) || 0)),
      };
      const seen = safeGet(seenKey);
      if (!seen) {
        // Pertama kali: anggap semua yang ada sudah dibaca agar tidak membanjiri notifikasi
        safeSet(seenKey, snapshot);
        setItems([]);
        return;
      }
      const list: Notif[] = [];
      mine(letters).forEach((l: any) => {
        if (l.status !== 'Menunggu' && seen.letters?.[l.id] !== l.status) {
          list.push({ key: `l${l.id}`, to: '/letters', title: `Surat ${l.type}: ${l.status}`, detail: 'Status permohonan surat Anda diperbarui.' });
        }
      });
      mine(reports).forEach((r: any) => {
        if (r.status !== 'Menunggu' && seen.reports?.[r.id] !== r.status) {
          list.push({ key: `r${r.id}`, to: '/reports', title: `Laporan "${r.title}": ${r.status}`, detail: 'Status laporan Anda diperbarui.' });
        }
      });
      announcements
        .filter((a: any) => Number(a.id) > (seen.ann || 0))
        .forEach((a: any) => list.push({ key: `a${a.id}`, to: '/announcements', title: 'Pengumuman baru', detail: a.title }));
      setItems(list);
      snapshotRef.current = snapshot;
    } catch {
      /* notifikasi bersifat pelengkap; abaikan error jaringan */
    }
  }, [role, user, seenKey]);

  /** Warga: tandai semua sudah dibaca. Pengurus: tidak berlaku (notifikasi hilang setelah ditindaklanjuti). */
  const markAllRead = useCallback(() => {
    if (role !== 'resident') return;
    if (snapshotRef.current) safeSet(seenKey, snapshotRef.current);
    setItems([]);
  }, [role, seenKey]);

  return { items, load, markAllRead };
}

export function Header({ title }: { title: string }) {
  const { role, user, isSuperAdmin, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { items, load, markAllRead } = useNotifications(role, user);

  useClickOutside(notifRef, useCallback(() => setNotifOpen(false), []));
  useClickOutside(menuRef, useCallback(() => setMenuOpen(false), []));

  // Muat ulang saat pindah halaman dan setiap 60 detik
  useEffect(() => { load(); }, [load, location.pathname]);
  useEffect(() => {
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => { setNotifOpen(false); setMenuOpen(false); }, [location.pathname]);

  const rtLabel = user?.rtId || user?.rt || '';
  const displayName = user?.name || (role === 'admin' ? 'Pengurus RT' : 'Warga');
  const roleLabel = isSuperAdmin ? 'Super Admin' : role === 'admin' ? `Pengurus ${rtLabel}` : `Warga ${rtLabel}`;
  const initials = isSuperAdmin ? 'SA' : role === 'admin' ? 'RT' : String(displayName).trim().charAt(0).toUpperCase() || 'W';

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white/80 backdrop-blur-md border-b border-slate-200/60 sticky top-0 z-30">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-8 py-3 sm:py-4">
        <h2 className="text-base sm:text-xl font-bold text-slate-800 ml-12 lg:ml-0 tracking-tight truncate">{title}</h2>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* Notifikasi */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => { setNotifOpen((o) => !o); setMenuOpen(false); if (!notifOpen) load(); }}
              className="relative p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
              aria-label="Notifikasi"
            >
              <Bell size={18} />
              {items.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white flex items-center justify-center">
                  {items.length > 9 ? '9+' : items.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-80 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800">Notifikasi</p>
                  {role === 'resident' && items.length > 0 && (
                    <button onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                      <CheckCheck size={14} /> Tandai dibaca
                    </button>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {items.length === 0 && (
                    <p className="px-4 py-8 text-center text-sm text-slate-400">Tidak ada notifikasi baru.</p>
                  )}
                  {items.map((n) => (
                    <Link
                      key={n.key}
                      to={n.to}
                      onClick={() => setNotifOpen(false)}
                      className="block px-4 py-3 hover:bg-slate-50 transition-colors"
                    >
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.detail}</p>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Menu profil */}
          <div className="relative pl-2 sm:pl-4 border-l border-slate-200" ref={menuRef}>
            <button
              onClick={() => { setMenuOpen((o) => !o); setNotifOpen(false); }}
              className="flex items-center gap-3 rounded-full sm:rounded-xl sm:pr-2 hover:bg-slate-50 transition-colors"
              aria-label="Menu akun"
            >
              <div className="text-right hidden sm:block max-w-[180px]">
                <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5 truncate">{roleLabel}</p>
              </div>
              <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold text-sm shadow-md shadow-indigo-500/20">
                {role === 'resident' ? <User size={18} /> : initials}
              </div>
              <ChevronDown size={16} className={`hidden sm:block text-slate-400 transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-800 truncate">{displayName}</p>
                  <p className="text-xs text-slate-500 truncate">{roleLabel}</p>
                </div>
                <div className="p-1.5">
                  <Link to="/profile" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                    <UserCircle size={18} className="text-slate-400" /> Profil Saya
                  </Link>
                  {isSuperAdmin && (
                    <Link to="/settings" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50">
                      <Settings size={18} className="text-slate-400" /> Pengaturan
                    </Link>
                  )}
                  <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50">
                    <LogOut size={18} /> Keluar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
