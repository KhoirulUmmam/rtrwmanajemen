import { Users, Wallet, ArrowUpRight, ArrowDownRight, Calendar, Heart, User, Minus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Resident, Transaction } from '@/types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

import {
  type Period, PERIOD_OPTIONS, PREVIOUS_LABEL, periodRange, previousRange, inRange,
  parseDate, formatRp, formatCompact, percentChange,
} from '@/lib/period';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

type Grouping = 'daily' | 'monthly' | 'yearly';
const GROUPING_OPTIONS: { value: Grouping; label: string }[] = [
  { value: 'daily', label: 'Harian' },
  { value: 'monthly', label: 'Bulanan' },
  { value: 'yearly', label: 'Tahunan' },
];

/** Badge perbandingan dengan periode sebelumnya, dihitung dari data asli. */
function ChangeBadge({ current, previous, period, positiveIsGood }: { current: number; previous: number; period: Period; positiveIsGood: boolean }) {
  if (period === 'all') {
    return <span className="text-xs text-slate-400">Seluruh transaksi</span>;
  }
  const pct = percentChange(current, previous);
  if (pct === null) {
    return <span className="text-xs text-slate-400">{current ? `Belum ada data ${PREVIOUS_LABEL[period]}` : 'Belum ada transaksi'}</span>;
  }
  const up = pct > 0;
  const good = pct === 0 ? null : up === positiveIsGood;
  const color = good === null ? 'text-slate-600 bg-slate-50 border-slate-100' : good ? 'text-emerald-600 bg-emerald-50/50 border-emerald-100/50' : 'text-red-600 bg-red-50/50 border-red-100/50';
  const Icon = pct === 0 ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 text-xs px-2.5 py-1 rounded-md border ${color}`}>
      <span className="inline-flex items-center font-semibold"><Icon size={14} className="mr-0.5" />{up ? '+' : ''}{pct}%</span>
      <span className="text-slate-500 font-medium">dari {PREVIOUS_LABEL[period]}</span>
    </span>
  );
}

export function Dashboard() {
  const [period, setPeriod] = useState<Period>('month');
  const [grouping, setGrouping] = useState<Grouping>('monthly');
  const [residents, setResidents] = useState<Resident[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [letters, setLetters] = useState<any[]>([]);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [resResidents, resTransactions, resLetters, resAnnouncements] = await Promise.all([
          fetch('/api/residents'),
          fetch('/api/transactions'),
          fetch('/api/letters'),
          fetch('/api/announcements'),
        ]);
        // Server sudah membatasi data sesuai RT & peran user
        const asArray = async (res: Response) => {
          const data = await res.json().catch(() => []);
          return res.ok && Array.isArray(data) ? data : [];
        };
        setResidents((await asArray(resResidents)).filter((r: any) => !['Pindah', 'Meninggal'].includes(r.status) && r.verified !== 'pending'));
        setTransactions((await asArray(resTransactions)).map((t: any) => ({ ...t, amount: Number(t.amount) || 0 })));
        setLetters(await asArray(resLetters));
        setAnnouncements((await asArray(resAnnouncements)).slice(0, 3));
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const totalResidents = residents.length;

  // Ringkasan kas untuk periode terpilih + periode sebelumnya (untuk persentase)
  const sumBy = (type: 'income' | 'expense', range: ReturnType<typeof periodRange>) =>
    transactions.filter(t => t.type === type && inRange(t.date, range)).reduce((acc, t) => acc + t.amount, 0);
  const currentRange = periodRange(period);
  const prevRange = previousRange(period);
  const periodIncome = sumBy('income', currentRange);
  const periodExpense = sumBy('expense', currentRange);
  const prevIncome = sumBy('income', prevRange);
  const prevExpense = sumBy('expense', prevRange);
  const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label;

  /** Data grafik: 14 hari terakhir / 12 bulan terakhir / per tahun. */
  const processChartData = () => {
    const buckets = new Map<string, { label: string; income: number; expense: number }>();
    const today = new Date();
    const keyOf = (d: Date) =>
      grouping === 'daily' ? `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
        : grouping === 'monthly' ? `${d.getFullYear()}-${d.getMonth()}`
          : `${d.getFullYear()}`;

    if (grouping === 'daily') {
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        buckets.set(keyOf(d), { label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, income: 0, expense: 0 });
      }
    } else if (grouping === 'monthly') {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        buckets.set(keyOf(d), { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, income: 0, expense: 0 });
      }
    } else {
      const years = transactions.map(t => parseDate(t.date)?.getFullYear()).filter(Boolean) as number[];
      const first = Math.min(today.getFullYear() - 2, ...years);
      for (let y = first; y <= today.getFullYear(); y++) buckets.set(String(y), { label: String(y), income: 0, expense: 0 });
    }

    transactions.forEach(t => {
      const d = parseDate(t.date);
      const bucket = d && buckets.get(keyOf(d));
      if (!bucket) return;
      if (t.type === 'income') bucket.income += t.amount;
      else bucket.expense += t.amount;
    });
    return [...buckets.values()];
  };

  const chartData = processChartData();

  const residentStatusData = [
    { name: 'Tetap', value: residents.filter(r => r.status === 'Tetap').length },
    { name: 'Kontrak', value: residents.filter(r => r.status === 'Kontrak').length },
    { name: 'Kost', value: residents.filter(r => r.status === 'Kost').length },
  ];

  const maleCount = residents.filter(r => r.gender === 'Laki-laki').length;
  const femaleCount = residents.filter(r => r.gender === 'Perempuan').length;
  const singleCount = residents.filter(r => r.maritalStatus === 'Lajang').length;
  const marriedCount = residents.filter(r => r.maritalStatus === 'Menikah').length;

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Filter periode untuk kartu kas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">Ringkasan kas: <span className="font-semibold text-slate-700">{periodLabel}</span></p>
        <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-xl overflow-x-auto max-w-full">
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${period === p.value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Total Warga</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-2 tracking-tight">{totalResidents}</h3>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-xl text-blue-600">
              <Users size={22} />
            </div>
          </div>
          <div className="mt-6 flex items-center gap-4 text-sm">
            <div className="flex items-center text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              <User size={14} className="mr-1.5 text-blue-500" />
              <span className="font-medium">{maleCount} L</span>
            </div>
            <div className="flex items-center text-slate-600 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100">
              <User size={14} className="mr-1.5 text-pink-500" />
              <span className="font-medium">{femaleCount} P</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500">Status Pernikahan</p>
              <div className="flex gap-4 mt-2">
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{marriedCount}</h3>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">Menikah</p>
                </div>
                <div className="w-px bg-slate-200"></div>
                <div>
                  <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{singleCount}</h3>
                  <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wider mt-0.5">Lajang</p>
                </div>
              </div>
            </div>
            <div className="p-3 bg-pink-500/10 rounded-xl text-pink-600">
              <Heart size={22} />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">Kas Masuk</p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mt-2 tracking-tight break-words">{formatRp(periodIncome)}</h3>
            </div>
            <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-600 shrink-0">
              <Wallet size={22} />
            </div>
          </div>
          <div className="mt-6">
            <ChangeBadge current={periodIncome} previous={prevIncome} period={period} positiveIsGood />
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60 hover:shadow-md transition-shadow relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-full -z-10 group-hover:scale-110 transition-transform duration-500"></div>
          <div className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-500">Pengeluaran</p>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mt-2 tracking-tight break-words">{formatRp(periodExpense)}</h3>
            </div>
            <div className="p-3 bg-red-500/10 rounded-xl text-red-600 shrink-0">
              <ArrowDownRight size={22} />
            </div>
          </div>
          <div className="mt-6">
            <ChangeBadge current={periodExpense} previous={prevExpense} period={period} positiveIsGood={false} />
          </div>
        </div>
      </div>

      {/* Pengumuman terbaru (data asli) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-800 tracking-tight">Pengumuman Terbaru</h3>
          <Link to="/announcements" className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors">Lihat Semua &rarr;</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {announcements.length === 0 && (
            <p className="text-sm text-slate-400 col-span-full">Belum ada pengumuman.</p>
          )}
          {announcements.map((a) => (
            <Link to="/announcements" key={a.id} className="p-5 rounded-xl border border-slate-200/60 hover:border-indigo-300 hover:shadow-md transition-all group bg-slate-50/50">
              <h4 className="font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors mb-2 line-clamp-1">{a.title}</h4>
              <div className="flex items-center gap-2 text-xs text-slate-400 mb-3">
                <Calendar size={14} />
                <span>{a.date}</span>
              </div>
              <p className="text-sm text-slate-500 line-clamp-3">{a.content}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-slate-200/60 lg:col-span-2 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 sm:mb-6">
            <h3 className="text-lg font-bold text-slate-800 tracking-tight">Statistik Keuangan</h3>
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {GROUPING_OPTIONS.map(g => (
                <button
                  key={g.value}
                  onClick={() => setGrouping(g.value)}
                  className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-medium transition-colors ${grouping === g.value ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {g.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-400 -mt-2 mb-4">
            {grouping === 'daily' ? '14 hari terakhir' : grouping === 'monthly' ? '12 bulan terakhir' : 'Per tahun'}
          </p>
          <div className="h-64 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} interval="preserveStartEnd" minTickGap={8} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748B', fontSize: 11 }} width={56} tickFormatter={(value) => formatCompact(Number(value))} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: 13 }}
                  formatter={(value: number, name: string) => [formatRp(Number(value)), name]}
                  cursor={{ fill: '#F1F5F9' }}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Bar dataKey="income" name="Pemasukan" fill="#4F46E5" radius={[4, 4, 0, 0]} maxBarSize={24} />
                <Bar dataKey="expense" name="Pengeluaran" fill="#EF4444" radius={[4, 4, 0, 0]} maxBarSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200/60">
          <h3 className="text-lg font-bold text-slate-800 mb-6 tracking-tight">Status Kependudukan</h3>
          <div className="h-64 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={residentStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={90}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {residentStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}
                  itemStyle={{ fontWeight: 500 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-6 space-y-3">
            {residentStatusData.map((entry, index) => (
              <div key={index} className="flex items-center justify-between text-sm p-2 rounded-lg hover:bg-slate-50 transition-colors">
                <div className="flex items-center">
                  <div className="w-3 h-3 rounded-full mr-3 shadow-sm" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                  <span className="text-slate-600 font-medium">{entry.name}</span>
                </div>
                <span className="font-bold text-slate-800">{entry.value} <span className="text-slate-400 font-normal text-xs ml-1">Warga</span></span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
