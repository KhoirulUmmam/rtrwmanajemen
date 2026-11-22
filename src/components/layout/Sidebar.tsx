import { 
  Users, 
  LayoutDashboard, 
  Wallet, 
  FileText, 
  Bell, 
  Settings,
  Menu,
  X,
  AlertCircle
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";

export function Sidebar() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const { role, isSuperAdmin, user, rtId } = useAuth();

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/", roles: ['admin', 'resident'] },
    { icon: Users, label: "Data Warga", path: "/residents", roles: ['admin'] },
    { icon: Wallet, label: "Keuangan", path: "/finance", roles: ['admin', 'resident'] },
    { icon: FileText, label: "Surat Pengantar", path: "/letters", roles: ['admin', 'resident'] },
    { icon: Bell, label: "Pengumuman", path: "/announcements", roles: ['admin', 'resident'] },
    { icon: AlertCircle, label: "Laporan Warga", path: "/reports", roles: ['admin', 'resident'] },
  ];

  return (
    <>
      {/* Mobile Menu Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-md shadow-md"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {/* Overlay */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar Content */}
      <aside className={cn(
        "fixed top-0 left-0 z-40 h-screen w-64 bg-[#0a0a0a] text-slate-300 transition-transform duration-300 ease-in-out lg:translate-x-0 border-r border-white/10",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6 border-b border-white/10">
            <Logo size={36} tone="light" subtitle={rtId && rtId !== 'SUPERADMIN' ? rtId : 'Semua RT'} />
            {role && user && (
              <div className="mt-6 p-3 bg-white/5 rounded-xl border border-white/10 backdrop-blur-sm">
                <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider mb-1">Login sebagai:</p>
                <p className="text-sm font-medium text-white truncate">{user.name}</p>
              </div>
            )}
          </div>

          <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto">
            {menuItems.filter(item => item.roles.includes(role || '')).map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                    isActive 
                      ? "bg-white/10 text-white shadow-sm border border-white/10" 
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <item.icon size={18} className={isActive ? "text-indigo-400" : ""} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {isSuperAdmin && (
            <div className="p-4 border-t border-white/10">
              <Link
                to="/settings"
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 w-full rounded-xl text-sm font-medium transition-all duration-200",
                  location.pathname === '/settings'
                    ? "bg-white/10 text-white shadow-sm border border-white/10"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <Settings size={18} className={location.pathname === '/settings' ? "text-indigo-400" : ""} />
                Pengaturan
              </Link>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
