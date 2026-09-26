import { useMemo } from 'react';
import {
  Users, Trophy, Wallet, TrendingUp, Activity, Target,
  Calendar, Award, Percent, Goal, ShieldCheck,
} from 'lucide-react';
import type { Player, Subscription, Match, Transaction, Staff, Team, Parent, PlayerEvaluation, Lang, Role, ViewId } from '@/types';
import { StatCard, PageHeader } from '@/components/ui';
import { DonutChart, BarChart, LineChart } from '@/components/Charts';
import { RemindersPanel } from '@/components/RemindersPanel';
import { getSubscriptionReminders } from '@/lib/reminders';
import { tr, monthsArray, statusLabel, positionLabel } from '@/lib/i18n';

interface DashboardProps {
  players: Player[];
  subscriptions: Subscription[];
  matches: Match[];
  transactions: Transaction[];
  staff: Staff[];
  teams: Team[];
  parents: Parent[];
  evaluations: PlayerEvaluation[];
  setCurrentTab: (v: ViewId) => void;
  activeRole: Role;
  lang: Lang;
}

export function Dashboard({ players, subscriptions, matches, transactions, staff, teams, parents, evaluations, setCurrentTab, lang }: DashboardProps) {
  const t = tr(lang);
  const isAr = lang === 'ar';
  const MONTHS = monthsArray(lang);

  const reminders = useMemo(
    () => getSubscriptionReminders(subscriptions, players, parents),
    [subscriptions, players, parents],
  );

  const reassessmentReminders = useMemo(() => {
    const latest = new Map<string, PlayerEvaluation>();
    evaluations.filter(ev => ev.status === 'published').forEach(ev => {
      const current = latest.get(ev.playerId);
      if (!current || ev.evaluationDate > current.evaluationDate) latest.set(ev.playerId, ev);
    });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingLimit = new Date(today);
    upcomingLimit.setDate(upcomingLimit.getDate() + 14);
    return Array.from(latest.values())
      .filter(ev => ev.reassessmentDate)
      .map(ev => {
        const due = new Date(`${ev.reassessmentDate}T00:00:00`);
        return { evaluation: ev, player: players.find(p => p.id === ev.playerId), due, overdue: due <= today };
      })
      .filter(item => item.due <= upcomingLimit)
      .sort((a, b) => a.due.getTime() - b.due.getTime());
  }, [evaluations, players]);

  const stats = useMemo(() => {
    const activePlayers = players.filter((p) => p.status === 'active').length;
    const totalRevenue = transactions.filter((tx) => tx.type === 'revenue').reduce((s, tx) => s + tx.amount, 0);
    const totalExpenses = transactions.filter((tx) => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
    const netProfit = totalRevenue - totalExpenses;
    const paidSubs = subscriptions.filter((s) => s.status === 'paid').length;
    const unpaidSubs = subscriptions.filter((s) => s.status === 'unpaid').length;
    const completedMatches = matches.filter((m) => m.result !== 'scheduled');
    const wins = matches.filter((m) => m.result === 'win').length;
    const draws = matches.filter((m) => m.result === 'draw').length;
    const losses = matches.filter((m) => m.result === 'loss').length;
    const scheduled = matches.filter((m) => m.result === 'scheduled').length;
    const winRate = completedMatches.length > 0 ? Math.round((wins / completedMatches.length) * 100) : 0;
    const goalsScored = matches.reduce((s, m) => s + m.academyScore, 0);
    const goalsConceded = matches.reduce((s, m) => s + m.opponentScore, 0);

    return {
      activePlayers, totalRevenue, totalExpenses, netProfit,
      paidSubs, unpaidSubs, wins, draws, losses, scheduled,
      winRate, goalsScored, goalsConceded,
      totalStaff: staff.length, totalTeams: teams.length,
    };
  }, [players, subscriptions, matches, transactions, staff, teams]);

  const positionData = useMemo(() => {
    const counts: Record<string, number> = {};
    players.forEach((p) => { counts[p.position] = (counts[p.position] || 0) + 1; });
    const colors: Record<string, string> = {
      'حارس مرمى': '#f59e0b', 'Goalkeeper': '#f59e0b',
      'مدافع': '#3b82f6', 'Defender': '#3b82f6',
      'خط وسط': '#10b981', 'Midfielder': '#10b981',
      'مهاجم': '#ef4444', 'Forward': '#ef4444',
    };
    return Object.entries(counts).map(([label, value]) => ({
      label: positionLabel(label, lang), value, color: colors[label] || '#94a3b8',
    }));
  }, [players, lang]);

  const teamPlayersData = useMemo(() => {
    return teams.map((team) => ({
      label: team.name.replace(isAr ? 'فئة ' : 'Team ', ''),
      value: players.filter((p) => p.teamId === team.id).length,
      color: '#10b981',
    }));
  }, [teams, players, isAr]);

  const revenueByMonth = useMemo(() => {
    const byMonth: Record<string, number> = {};
    transactions.filter((tx) => tx.type === 'revenue').forEach((tx) => {
      const month = tx.transactionDate.substring(5, 7);
      const idx = parseInt(month) - 1;
      const label = MONTHS[idx] || month;
      byMonth[label] = (byMonth[label] || 0) + tx.amount;
    });
    return MONTHS.slice(0, 7).map((label) => ({ label, value: byMonth[label] || 0 }));
  }, [transactions, MONTHS]);

  const recentMatches = useMemo(() =>
    [...matches].sort((a, b) => b.matchDate.localeCompare(a.matchDate)).slice(0, 4),
  [matches]);

  return (
    <div className="space-y-6 text-right" dir={isAr ? 'rtl' : 'ltr'}>
      <PageHeader title={t.dashboard} subtitle={isAr ? 'نظرة شاملة على مؤشرات الأكاديمية والمالية والفنية' : 'Overview of academy, financial, and performance metrics'} />

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Users className="h-5 w-5" />} label={t.activePlayers} value={stats.activePlayers} sublabel={`${t.activePlayersSub} ${stats.totalTeams} ${t.teamsLabel}`} color="emerald" onClick={() => setCurrentTab('players')} />
        <StatCard icon={<Wallet className="h-5 w-5" />} label={t.netProfit} value={`${stats.netProfit.toLocaleString()} ${t.currency}`} sublabel={`${t.revenueLabel} ${stats.totalRevenue.toLocaleString()}`} color="blue" onClick={() => setCurrentTab('subscriptions')} />
        <StatCard icon={<Trophy className="h-5 w-5" />} label={t.winRate} value={`${stats.winRate}%`} sublabel={`${stats.wins} ${t.wins} · ${stats.losses} ${t.losses}`} color="amber" onClick={() => setCurrentTab('schedules')} />
        <StatCard icon={<Activity className="h-5 w-5" />} label={t.paidSubsLabel} value={`${stats.paidSubs}/${stats.paidSubs + stats.unpaidSubs}`} sublabel={`${stats.unpaidSubs} ${t.unpaidSubsLabel}`} color="red" onClick={() => setCurrentTab('subscriptions')} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<Goal className="h-5 w-5" />} label={t.goalsScored} value={stats.goalsScored} sublabel={`${t.goalsConceded} ${stats.goalsConceded}`} color="emerald" onClick={() => setCurrentTab('schedules')} />
        <StatCard icon={<Target className="h-5 w-5" />} label={t.goalDifference} value={stats.goalsScored - stats.goalsConceded} sublabel={t.goalDifference} color="blue" onClick={() => setCurrentTab('schedules')} />
        <StatCard icon={<Calendar className="h-5 w-5" />} label={t.scheduledMatches} value={stats.scheduled} sublabel={t.scheduledMatchesHint} color="amber" onClick={() => setCurrentTab('schedules')} />
        <StatCard icon={<Award className="h-5 w-5" />} label={t.totalStaff} value={stats.totalStaff} sublabel={t.totalStaffHint} color="slate" onClick={() => setCurrentTab('staff')} />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Revenue line chart */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{t.monthlyRevenue}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{t.monthlyRevenueHint}</p>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-black text-emerald-600">{stats.totalRevenue.toLocaleString()} {t.currency}</span>
            </div>
          </div>
          <LineChart data={revenueByMonth} color="#10b981" height={200} />
        </div>

        {/* Position distribution donut */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 dark:text-white mb-1">{t.positionDistribution}</h3>
          <p className="text-[11px] text-slate-400 mb-4">{t.positionDistributionHint}</p>
          <DonutChart
            data={positionData}
            centerValue={players.length.toString()}
            centerLabel={t.playerLabel}
          />
        </div>
      </div>

      {/* Bottom row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Team players bar chart */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">{t.playersPerTeam}</h3>
          <BarChart data={teamPlayersData} />
        </div>

        {/* Match results donut */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">{t.matchResults}</h3>
          <DonutChart
            data={[
              { label: t.win, value: stats.wins, color: '#10b981' },
              { label: t.draw, value: stats.draws, color: '#f59e0b' },
              { label: t.loss, value: stats.losses, color: '#ef4444' },
              { label: t.scheduled, value: stats.scheduled, color: '#94a3b8' },
            ]}
            centerValue={`${stats.winRate}%`}
            centerLabel={t.winRateLabel}
          />
        </div>

        {/* Recent matches */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-black text-slate-900 dark:text-white">{t.recentMatches}</h3>
            <button onClick={() => setCurrentTab('schedules')} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">{t.viewAll}</button>
          </div>
          <div className="space-y-3">
            {recentMatches.map((m) => {
              const team = teams.find((tm) => tm.id === m.teamId);
              const resultColor = m.result === 'win' ? 'bg-emerald-500' : m.result === 'loss' ? 'bg-red-500' : m.result === 'draw' ? 'bg-amber-500' : 'bg-slate-400';
              const resultLabel = statusLabel(m.result, lang);
              return (
                <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className={`w-1.5 h-10 rounded-full ${resultColor}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{t.against} {m.opponent}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">{team?.ageGroup}</p>
                  </div>
                  <div className="text-left shrink-0">
                    {m.result !== 'scheduled' ? (
                      <span className="text-sm font-black text-slate-900 dark:text-white">{m.academyScore} - {m.opponentScore}</span>
                    ) : (
                      <span className="text-xs font-bold text-slate-400">{resultLabel}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reminders panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RemindersPanel reminders={reminders} onNavigate={() => setCurrentTab('subscriptions')} compact lang={lang} />

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">{isAr ? 'إعادة تقييم اللاعبين' : 'Player reassessments'}</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">{isAr ? 'المستحق والقادم خلال 14 يومًا' : 'Due and upcoming within 14 days'}</p>
            </div>
            <button onClick={() => setCurrentTab('evaluations')} className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">{t.viewAll}</button>
          </div>
          {reassessmentReminders.length === 0 ? (
            <div className="py-6 text-center">
              <Calendar className="h-7 w-7 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-400">{isAr ? 'لا توجد إعادة تقييم مستحقة أو قريبة' : 'No reassessments due or upcoming'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {reassessmentReminders.slice(0, 5).map(({ evaluation, player, overdue }) => (
                <button key={evaluation.id} onClick={() => setCurrentTab('evaluations')} className="w-full flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-start cursor-pointer">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${overdue ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">{player?.name || (isAr ? 'لاعب' : 'Player')}</p>
                    <p className="text-[10px] text-slate-400">{isAr ? 'إعادة التقييم' : 'Reassessment'}: {evaluation.reassessmentDate}</p>
                  </div>
                  <span className={`text-[10px] font-black ${overdue ? 'text-red-600' : 'text-amber-600'}`}>{overdue ? (isAr ? 'مستحق' : 'Due') : (isAr ? 'قريب' : 'Upcoming')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick stats summary */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
          <h3 className="text-sm font-black text-slate-900 dark:text-white mb-4">{t.quickSummary}</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20">
              <p className="text-[11px] font-bold text-red-600 dark:text-red-400">{t.overdue}</p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{reminders.filter((r) => r.status === 'overdue').length}</p>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20">
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">{t.expiring}</p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{reminders.filter((r) => r.status === 'expiring').length}</p>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20">
              <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">{t.dueAmounts}</p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{reminders.reduce((s, r) => s + r.subscription.amount, 0)} {t.currency}</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400">{t.collectionRate}</p>
              <p className="text-xl font-black text-slate-900 dark:text-white mt-1">
                {subscriptions.length > 0 ? Math.round((subscriptions.filter((s) => s.status === 'paid').length / subscriptions.length) * 100) : 0}%
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h3 className="text-sm font-black">{t.quickActions}</h3>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: t.addPlayer, icon: Users, tab: 'players' as ViewId },
            { label: t.recordAttendance, icon: Percent, tab: 'attendance' as ViewId },
            { label: t.scheduleMatch, icon: Calendar, tab: 'schedules' as ViewId },
            { label: t.recordPayment, icon: Wallet, tab: 'subscriptions' as ViewId },
          ].map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.tab}
                onClick={() => setCurrentTab(action.tab)}
                className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer text-right"
              >
                <Icon className="h-4 w-4 text-emerald-400 shrink-0" />
                <span className="text-xs font-bold">{action.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
