import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Outlet, useLocation } from "react-router-dom";

export function Layout() {
  const location = useLocation();
  
  const getPageTitle = () => {
    switch(location.pathname) {
      case "/": return "Dashboard Overview";
      case "/residents": return "Data Kependudukan";
      case "/finance": return "Laporan Keuangan";
      case "/letters": return "Layanan Surat";
      case "/announcements": return "Pengumuman Warga";
      case "/settings": return "Pengaturan Sistem";
      case "/reports": return "Laporan Warga";
      case "/profile": return "Profil Saya";
      default: return "Sistem Manajemen RT/RW";
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] font-sans text-slate-900 flex relative overflow-hidden">
      {/* Subtle background decoration */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-50/50 to-transparent -z-10 pointer-events-none"></div>
      <Sidebar />
      {/* min-w-0 wajib: tanpa ini <main> ikut melebar seukuran tabel lalu terpotong di HP */}
      <main className="flex-1 min-w-0 lg:ml-64 min-h-screen flex flex-col relative z-10">
        <Header title={getPageTitle()} />
        <div className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}
