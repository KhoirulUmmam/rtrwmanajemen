import { useId } from "react";

/**
 * Logo aplikasi: atap rumah menaungi tiga warga (lingkungan RT/RW & warganya).
 * Versi file statis yang sama ada di public/favicon.svg (ikon tab browser).
 */
export function LogoMark({ size = 40, className = "" }: { size?: number; className?: string }) {
  // id gradien unik agar tidak bentrok bila logo tampil lebih dari sekali di satu halaman
  const gid = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Logo Manajemen RT/RW">
      <defs>
        <linearGradient id={`lg${gid}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#9333EA" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#lg${gid})`} />
      {/* Atap */}
      <path d="M13 31 L32 15 L51 31" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Warga kiri & kanan */}
      <g fill="#fff" opacity="0.72">
        <circle cx="19.5" cy="37" r="3.6" />
        <path d="M13.5 50 a6 6 0 0 1 12 0 z" />
        <circle cx="44.5" cy="37" r="3.6" />
        <path d="M38.5 50 a6 6 0 0 1 12 0 z" />
      </g>
      {/* Warga tengah */}
      <g fill="#fff">
        <circle cx="32" cy="32" r="4.6" />
        <path d="M23.5 50 a8.5 8.5 0 0 1 17 0 z" />
      </g>
    </svg>
  );
}

/** Logo + nama aplikasi. tone="light" untuk latar gelap. */
export function Logo({ size = 40, tone = "dark", subtitle, className = "" }: {
  size?: number;
  tone?: "dark" | "light";
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} className="shrink-0 drop-shadow-sm" />
      <div className="min-w-0 leading-tight">
        <p className={`font-bold tracking-tight truncate ${tone === "light" ? "text-white" : "text-slate-900"}`} style={{ fontSize: Math.max(14, size * 0.42) }}>
          Manajemen RT/RW
        </p>
        {subtitle && (
          <p className={`text-[11px] font-medium uppercase tracking-wider truncate ${tone === "light" ? "text-slate-400" : "text-slate-500"}`}>
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
}
