import { useMemo, type ReactNode } from 'react';
import {
  BarChart3, Download, TrendingUp, Users, Trophy, Wallet,
  Activity, Target, Award, Percent, Printer,
} from 'lucide-react';
import type {
  Player, Team, Staff, Match, Training, Transaction, Subscription,
  Attendance, Lang, Role,
} from '@/types';
import { PageHeader, StatCard } from '@/components/ui';
import { tr, monthsArray, roleLabel, positionLabel, statusLabel } from '@/lib/i18n';
import { BarChart, DonutChart, LineChart } from '@/components/Charts';

interface ReportsProps {
  players: Player[];
  teams: Team[];
  staff: Staff[];
  matches: Match[];
  trainings: Training[];
  transactions: Transaction[];
  subscriptions: Subscription[];
  attendance: Attendance[];
  activeRole: Role;
  lang: Lang;
}

function SectionCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
      {children}
    </div>
  );
}

function SectionHeader({
  icon, title, subtitle, gradient,
}: {
  icon: ReactNode; title: string; subtitle?: string; gradient: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center text-white shadow-lg shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-black text-slate-900 dark:text-white">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function downloadCsv(filename: string, header: string, rows: string[]) {
  const bom = '\uFEFF';
  const blob = new Blob([bom + header + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function esc(v: string) { return `"${(v || '').replace(/"/g, '""')}"`; }

function exportReportCsv(
  type: 'players' | 'financial',
  data: (Player | Transaction)[],
  teams: Team[],
  lang: Lang,
) {
  const teamName = (id: string) => teams.find((tm) => tm.id === id)?.name || '';
  if (type === 'players') {
    const header = 'Name,Team,Position,Jersey,Birth Date,Status,Joined';
    const rows = (data as Player[]).map((p) =>
      [esc(p.name), esc(teamName(p.teamId)), esc(p.position), p.jerseyNumber, p.birthDate, p.status, p.joinedDate].join(',')
    );
    downloadCsv(`players-${Date.now()}.csv`, header, rows);
  } else {
    const header = 'Date,Type,Category,Amount,Description,Recorded By';
    const rows = (data as Transaction[]).map((tx) =>
      [tx.transactionDate, tx.type, esc(tx.category), tx.amount, esc(tx.description), esc(tx.recordedBy)].join(',')
    );
    downloadCsv(`financial-${Date.now()}.csv`, header, rows);
  }
}

export function Reports({
  players, teams, staff, matches, transactions,
  subscriptions, attendance, lang,
}: ReportsProps) {
  const t = tr(lang);
  const isAr = lang === 'ar';
  const MONTHS = monthsArray(lang);

  const POSITION_COLORS: Record<string, string> = {
    'حارس مرمى': '#f59e0b', 'Goalkeeper': '#f59e0b',
    'مدافع': '#3b82f6', 'Defender': '#3b82f6',
    'خط وسط': '#10b981', 'Midfielder': '#10b981',
    'مهاجم': '#ef4444', 'Forward': '#ef4444',
  };

  /* Financial Summary */
  const financial = useMemo(() => {
    const revenueTotal = transactions.filter((tx) => tx.type === 'revenue').reduce((s, tx) => s + tx.amount, 0);
    const expenseTotal = transactions.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    const netProfit = revenueTotal - expenseTotal;
    const paidSubs = subscriptions.filter((s) => s.status === 'paid').length;
    const totalSubs = subscriptions.length;
    const collectionRate = totalSubs > 0 ? Math.round((paidSubs / totalSubs) * 100) : 0;

    const byMonthRev: Record<string, number> = {};
    const byMonthExp: Record<string, number> = {};
    transactions.forEach((tx) => {
      const monthIdx = parseInt(tx.transactionDate.substring(5, 7), 10) - 1;
      const label = MONTHS[monthIdx] || tx.transactionDate.substring(5, 7);
      if (tx.type === 'revenue') byMonthRev[label] = (byMonthRev[label] || 0) + tx.amount;
      else byMonthExp[label] = (byMonthExp[label] || 0) + tx.amount;
    });

    const activeMonths = MONTHS.filter((m) => byMonthRev[m] || byMonthExp[m]);
    const months = activeMonths.length > 0 ? activeMonths : MONTHS.slice(0, 6);

    return {
      revenueTotal, expenseTotal, netProfit, collectionRate, paidSubs, totalSubs,
      revenueBars: months.map((label) => ({ label, value: byMonthRev[label] || 0, color: '#10b981' })),
      expenseBars: months.map((label) => ({ label, value: byMonthExp[label] || 0, color: '#ef4444' })),
      netTrend: months.map((label) => ({ label, value: (byMonthRev[label] || 0) - (byMonthExp[label] || 0) })),
    };
  }, [transactions, subscriptions, MONTHS]);

  /* Performance Analytics */
  const performance = useMemo(() => {
    const completed = matches.filter((m) => m.result !== 'scheduled');
    const wins = matches.filter((m) => m.result === 'win').length;
    const draws = matches.filter((m) => m.result === 'draw').length;
    const losses = matches.filter((m) => m.result === 'loss').length;
    const scheduled = matches.filter((m) => m.result === 'scheduled').length;
    const winRate = completed.length > 0 ? Math.round((wins / completed.length) * 100) : 0;
    const totalGoals = matches.reduce((s, m) => s + m.academyScore, 0);
    const goalsConceded = matches.reduce((s, m) => s + m.opponentScore, 0);
    const goalDifference = totalGoals - goalsConceded;

    return {
      wins, draws, losses, scheduled, winRate, completed,
      totalGoals, goalsConceded, goalDifference,
      resultsDonut: [
        { label: t.win, value: wins, color: '#10b981' },
        { label: t.draw, value: draws, color: '#f59e0b' },
        { label: t.loss, value: losses, color: '#ef4444' },
        { label: t.scheduled, value: scheduled, color: '#94a3b8' },
      ],
    };
  }, [matches, t]);

  /* Player Statistics */
  const playerStats = useMemo(() => {
    const totalPlayers = players.length;
    const activePlayers = players.filter((p) => p.status === 'active').length;
    const positionCounts: Record<string, number> = {};
    players.forEach((p) => { positionCounts[p.position] = (positionCounts[p.position] || 0) + 1; });
    const positionDonut = Object.entries(positionCounts).map(([label, value]) => ({
      label: positionLabel(label, lang), value, color: POSITION_COLORS[label] || '#94a3b8',
    }));
    const teamBars = teams.map((team) => ({
      label: team.name.replace(isAr ? 'فئة ' : 'Team ', ''),
      value: players.filter((p) => p.teamId === team.id).length, color: '#10b981',
    }));
    return { totalPlayers, activePlayers, positionDonut, teamBars };
  }, [players, teams, lang, isAr, POSITION_COLORS]);

  /* Attendance Report */
  const attendanceStats = useMemo(() => {
    const totalSessions = attendance.length;
    const present = attendance.filter((a) => a.status === 'present').length;
    const absent = attendance.filter((a) => a.status === 'absent').length;
    const excused = attendance.filter((a) => a.status === 'excused').length;
    const presentRate = totalSessions > 0 ? Math.round((present / totalSessions) * 100) : 0;
    const absentRate = totalSessions > 0 ? Math.round((absent / totalSessions) * 100) : 0;
    const excusedRate = totalSessions > 0 ? Math.round((excused / totalSessions) * 100) : 0;
    return {
      totalSessions, present, absent, excused, presentRate, absentRate, excusedRate,
      distribution: [
        { label: t.present, value: present, color: '#10b981' },
        { label: t.absent, value: absent, color: '#ef4444' },
        { label: t.excused, value: excused, color: '#f59e0b' },
      ],
    };
  }, [attendance, t]);

  /* Staff Summary */
  const staffStats = useMemo(() => {
    const totalStaff = staff.length;
    const totalPayroll = staff.reduce((s, st) => s + st.salary, 0);
    const roleCount: Record<string, number> = {};
    staff.forEach((st) => { const label = roleLabel(st.role, lang); roleCount[label] = (roleCount[label] || 0) + 1; });
    return { totalStaff, totalPayroll, roleBars: Object.entries(roleCount).map(([label, value]) => ({ label, value, color: '#6366f1' })) };
  }, [staff, lang]);

  return (
    <div className="space-y-6 text-right" dir={isAr ? 'rtl' : 'ltr'}>
      <PageHeader title={t.reports} subtitle={t.reportsSubtitle}>
        <button onClick={() => exportReportCsv('players', players, teams, lang)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition cursor-pointer shadow-sm">
          <Download className="h-4 w-4" /> {t.exportPlayersCsv}
        </button>
        <button onClick={() => exportReportCsv('financial', transactions, teams, lang)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer shadow-sm">
          <Download className="h-4 w-4" /> {t.exportFinancialCsv}
        </button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer shadow-sm">
          <Printer className="h-4 w-4" /> {t.print}
        </button>
      </PageHeader>

      {/* Financial Summary */}
      <SectionCard>
        <SectionHeader icon={<Wallet className="h-5 w-5" />} title={t.financialSummary} subtitle={t.financialSummarySubtitle} gradient="from-blue-500 to-blue-600" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label={t.totalRevenue} value={`${financial.revenueTotal.toLocaleString()} ${t.currency}`} color="emerald" />
          <StatCard icon={<Wallet className="h-5 w-5" />} label={t.totalExpenses} value={`${financial.expenseTotal.toLocaleString()} ${t.currency}`} color="red" />
          <StatCard icon={<Activity className="h-5 w-5" />} label={t.netProfit} value={`${financial.netProfit.toLocaleString()} ${t.currency}`} sublabel={financial.netProfit >= 0 ? t.positive : t.negative} color={financial.netProfit >= 0 ? 'blue' : 'red'} />
          <StatCard icon={<Percent className="h-5 w-5" />} label={t.collectionRate} value={`${financial.collectionRate}%`} sublabel={`${financial.paidSubs} / ${financial.totalSubs}`} color="amber" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />{t.monthlyRevenueBars}</p>
            <BarChart data={financial.revenueBars} valueFormatter={(v) => v.toLocaleString()} height={180} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500" />{t.monthlyExpenseBars}</p>
            <BarChart data={financial.expenseBars} valueFormatter={(v) => v.toLocaleString()} height={180} />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500" />{t.netProfitTrend}</p>
            <LineChart data={financial.netTrend} color="#3b82f6" height={180} />
          </div>
        </div>
      </SectionCard>

      {/* Performance Analytics */}
      <SectionCard>
        <SectionHeader icon={<Trophy className="h-5 w-5" />} title={t.performanceAnalytics} subtitle={t.performanceAnalyticsSubtitle} gradient="from-amber-500 to-amber-600" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<Trophy className="h-5 w-5" />} label={t.winRate} value={`${performance.winRate}%`} sublabel={`${performance.wins} ${t.wins} · ${performance.completed.length}`} color="amber" />
          <StatCard icon={<Target className="h-5 w-5" />} label={t.goalsScored} value={performance.totalGoals} sublabel={t.revenueRecorded} color="emerald" />
          <StatCard icon={<Activity className="h-5 w-5" />} label={isAr ? 'الأهداف المستقبلة' : 'Goals Conceded'} value={performance.goalsConceded} sublabel={t.goalsAgainst} color="red" />
          <StatCard icon={<Award className="h-5 w-5" />} label={t.goalDifference} value={performance.goalDifference > 0 ? `+${performance.goalDifference}` : performance.goalDifference} sublabel={performance.goalDifference >= 0 ? t.positive : t.negative} color={performance.goalDifference >= 0 ? 'blue' : 'red'} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">{t.matchResultsDistribution}</p>
            <DonutChart data={performance.resultsDonut} centerValue={`${performance.winRate}%`} centerLabel={t.winRateLabel} size={180} />
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">{t.matchResultsBreakdown}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4 text-center"><p className="text-3xl font-black text-emerald-600 dark:text-emerald-400">{performance.wins}</p><p className="text-xs font-bold text-emerald-700 dark:text-emerald-500 mt-1">{t.win}</p></div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 p-4 text-center"><p className="text-3xl font-black text-amber-600 dark:text-amber-400">{performance.draws}</p><p className="text-xs font-bold text-amber-700 dark:text-amber-500 mt-1">{t.draw}</p></div>
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 p-4 text-center"><p className="text-3xl font-black text-red-600 dark:text-red-400">{performance.losses}</p><p className="text-xs font-bold text-red-700 dark:text-red-500 mt-1">{t.loss}</p></div>
              <div className="rounded-xl bg-slate-100 dark:bg-slate-700/40 p-4 text-center"><p className="text-3xl font-black text-slate-600 dark:text-slate-300">{performance.scheduled}</p><p className="text-xs font-bold text-slate-700 dark:text-slate-400 mt-1">{t.scheduled}</p></div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Player Statistics */}
      <SectionCard>
        <SectionHeader icon={<Users className="h-5 w-5" />} title={t.playerStatistics} subtitle={t.playerStatisticsSubtitle} gradient="from-emerald-500 to-emerald-600" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<Users className="h-5 w-5" />} label={t.totalPlayers} value={playerStats.totalPlayers} sublabel={t.allRegistered} color="emerald" />
          <StatCard icon={<Activity className="h-5 w-5" />} label={t.activePlayersCount} value={playerStats.activePlayers} sublabel={`${playerStats.totalPlayers > 0 ? Math.round((playerStats.activePlayers / playerStats.totalPlayers) * 100) : 0}%`} color="blue" />
          <StatCard icon={<Trophy className="h-5 w-5" />} label={t.teamsCount} value={teams.length} sublabel={t.ageGroups} color="amber" />
          <StatCard icon={<Target className="h-5 w-5" />} label={t.avgPlayersPerTeam} value={teams.length > 0 ? (playerStats.totalPlayers / teams.length).toFixed(1) : '0'} sublabel={t.perTeam} color="slate" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">{t.positionDistributionReport}</p>
            <DonutChart data={playerStats.positionDonut} centerValue={playerStats.totalPlayers.toString()} centerLabel={t.playerLabel} size={180} />
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">{t.playersPerTeam}</p>
            <BarChart data={playerStats.teamBars} height={180} />
          </div>
        </div>
      </SectionCard>

      {/* Attendance Report */}
      <SectionCard>
        <SectionHeader icon={<Percent className="h-5 w-5" />} title={t.attendanceReport} subtitle={t.attendanceReportSubtitle} gradient="from-violet-500 to-violet-600" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard icon={<Activity className="h-5 w-5" />} label={t.totalSessions} value={attendanceStats.totalSessions} sublabel={t.attendanceAndAbsence} color="purple" />
          <StatCard icon={<TrendingUp className="h-5 w-5" />} label={t.attendanceRate} value={`${attendanceStats.presentRate}%`} sublabel={`${attendanceStats.present} ${t.attendanceRecords}`} color="emerald" />
          <StatCard icon={<Activity className="h-5 w-5" />} label={t.absenceRate} value={`${attendanceStats.absentRate}%`} sublabel={`${attendanceStats.absent} ${t.absenceRecords}`} color="red" />
          <StatCard icon={<Award className="h-5 w-5" />} label={t.excusedRate} value={`${attendanceStats.excusedRate}%`} sublabel={`${attendanceStats.excused} ${t.excusedRecords}`} color="amber" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">{t.attendanceDistribution}</p>
            <DonutChart data={attendanceStats.distribution} centerValue={`${attendanceStats.presentRate}%`} centerLabel={isAr ? 'نسبة الحضور' : 'Attendance'} size={180} />
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">{t.attendanceBreakdown}</p>
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
                <div className="w-10 h-10 rounded-lg bg-emerald-500 flex items-center justify-center text-white shrink-0"><TrendingUp className="h-5 w-5" /></div>
                <div className="flex-1"><p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.present}</p><p className="text-[11px] text-slate-400">{attendanceStats.present} {isAr ? 'سجل' : 'records'}</p></div>
                <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">{attendanceStats.presentRate}%</span>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-red-50 dark:bg-red-900/20">
                <div className="w-10 h-10 rounded-lg bg-red-500 flex items-center justify-center text-white shrink-0"><Activity className="h-5 w-5" /></div>
                <div className="flex-1"><p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.absent}</p><p className="text-[11px] text-slate-400">{attendanceStats.absent} {isAr ? 'سجل' : 'records'}</p></div>
                <span className="text-lg font-black text-red-600 dark:text-red-400">{attendanceStats.absentRate}%</span>
              </div>
              <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20">
                <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center text-white shrink-0"><Award className="h-5 w-5" /></div>
                <div className="flex-1"><p className="text-sm font-bold text-slate-800 dark:text-slate-200">{t.excused}</p><p className="text-[11px] text-slate-400">{attendanceStats.excused} {isAr ? 'سجل' : 'records'}</p></div>
                <span className="text-lg font-black text-amber-600 dark:text-amber-400">{attendanceStats.excusedRate}%</span>
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Staff Summary */}
      <SectionCard>
        <SectionHeader icon={<BarChart3 className="h-5 w-5" />} title={t.staffSummary} subtitle={t.staffSummarySubtitle} gradient="from-slate-600 to-slate-700" />
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <StatCard icon={<Users className="h-5 w-5" />} label={t.totalStaffCount} value={staffStats.totalStaff} sublabel={t.coachesAndStaff} color="slate" />
          <StatCard icon={<Wallet className="h-5 w-5" />} label={t.totalSalaries} value={`${staffStats.totalPayroll.toLocaleString()} ${t.currency}`} sublabel={t.monthlyLabel} color="blue" />
          <StatCard icon={<Target className="h-5 w-5" />} label={t.avgSalary} value={`${staffStats.totalStaff > 0 ? Math.round(staffStats.totalPayroll / staffStats.totalStaff).toLocaleString() : 0} ${t.currency}`} sublabel={t.perEmployee} color="amber" />
        </div>
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-5">
          <p className="text-xs font-bold text-slate-600 dark:text-slate-300 mb-4">{t.staffByRole}</p>
          <BarChart data={staffStats.roleBars} height={180} />
        </div>
      </SectionCard>
    </div>
  );
}
