import { useState, useEffect, useMemo, useCallback, useRef, Suspense, lazy, Component, type ReactNode } from 'react';
import { Menu, Bell, Clock, Target, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { db, prefs, seedDatabaseIfEmpty, signOut, resetAndSeedDatabase, isRegistering } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';
import { tr } from '@/lib/i18n';
import { generateReminderNotifications } from '@/lib/reminders';
import type {
  CurrentUser, Lang, Role, ViewId,
  Staff as StaffType, Team, Player, Parent, Subscription, Attendance,
  Match, Training, Transaction, Tournament as TournamentType, Video as VideoType,
  Settings as SettingsType, Notification, AuditLog,
} from '@/types';
import { Login } from '@/components/Login';
import { Sidebar } from '@/components/Sidebar';
import { ConfirmDialog } from '@/components/ui';

/* ── Lazy-loaded views for code splitting ── */
const Dashboard = lazy(() => import('@/views/Dashboard').then(m => ({ default: m.Dashboard })));
const Approvals = lazy(() => import('@/views/Approvals').then(m => ({ default: m.Approvals })));
const Players = lazy(() => import('@/views/Players').then(m => ({ default: m.Players })));
const Parents = lazy(() => import('@/views/Parents').then(m => ({ default: m.Parents })));
const Teams = lazy(() => import('@/views/Teams').then(m => ({ default: m.Teams })));
const StaffView = lazy(() => import('@/views/Staff').then(m => ({ default: m.StaffView })));
const Subscriptions = lazy(() => import('@/views/Subscriptions').then(m => ({ default: m.Subscriptions })));
const AttendanceView = lazy(() => import('@/views/Attendance').then(m => ({ default: m.AttendanceView })));
const Schedules = lazy(() => import('@/views/Schedules').then(m => ({ default: m.Schedules })));
const Reports = lazy(() => import('@/views/Reports').then(m => ({ default: m.Reports })));
const MobileView = lazy(() => import('@/views/MobileView').then(m => ({ default: m.MobileView })));
const AICenter = lazy(() => import('@/views/AICenter').then(m => ({ default: m.AICenter })));
const SettingsView = lazy(() => import('@/views/Settings').then(m => ({ default: m.SettingsView })));
const Tournaments = lazy(() => import('@/views/Tournaments').then(m => ({ default: m.Tournaments })));
const Videos = lazy(() => import('@/views/Videos').then(m => ({ default: m.Videos })));
const AuditLogs = lazy(() => import('@/views/AuditLogs').then(m => ({ default: m.AuditLogs })));
const Messages = lazy(() => import('@/views/Messages').then(m => ({ default: m.Messages })));

/* ── Error Boundary ── */
interface ErrorBoundaryProps { children: ReactNode; lang: Lang; }
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      const isAr = this.props.lang === 'ar';
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center" dir={isAr ? 'rtl' : 'ltr'}>
          <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
          <h2 className="text-lg font-black text-slate-800 dark:text-white mb-2">
            {isAr ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md">
            {isAr ? 'يرجى تحديث الصفحة أو المحاولة مرة أخرى.' : 'Please refresh the page or try again.'}
          </p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold cursor-pointer hover:bg-emerald-500 transition"
          >
            <RefreshCw className="h-4 w-4" />
            {isAr ? 'إعادة المحاولة' : 'Try Again'}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ViewLoader() {
  return (
    <div className="flex items-center justify-center min-h-[300px]">
      <Loader2 className="h-7 w-7 text-emerald-600 animate-spin" />
    </div>
  );
}

type DataState = {
  settings: SettingsType | null;
  staff: StaffType[];
  teams: Team[];
  players: Player[];
  parents: Parent[];
  subscriptions: Subscription[];
  attendance: Attendance[];
  matches: Match[];
  trainings: Training[];
  transactions: Transaction[];
  tournaments: TournamentType[];
  videos: VideoType[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  loginLogs: AuditLog[];
};

const EMPTY_DATA: DataState = {
  settings: null, staff: [], teams: [], players: [], parents: [],
  subscriptions: [], attendance: [], matches: [], trainings: [],
  transactions: [], tournaments: [], videos: [], notifications: [],
  auditLogs: [], loginLogs: [],
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [activeRole, setActiveRole] = useState<Role>('manager');
  const [currentTab, setCurrentTab] = useState<ViewId>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lang, setLang] = useState<Lang>('ar');
  const [darkMode, setDarkMode] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentTime, setCurrentTime] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<DataState>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    setLang(prefs.getLang());
    setDarkMode(prefs.getDarkMode());

    const { data: authData } = supabase.auth.onAuthStateChange((_event, session: Session | null) => {
      (async () => {
        if (isRegistering()) {
          setAuthReady(true);
          return;
        }
        if (!session?.user) {
          setCurrentUser(null);
          setData(EMPTY_DATA);
          setAuthReady(true);
          return;
        }
        const email = session.user.email;
        if (!email) {
          setCurrentUser(null);
          setAuthReady(true);
          return;
        }
        try {
          const staff = await db.getStaff();
          const member = staff.find((s) => s.email.toLowerCase() === email.toLowerCase());
          if (!member) {
            await signOut();
            setCurrentUser(null);
            setAuthReady(true);
            return;
          }
          if (member.status === 'pending') {
            await signOut();
            setCurrentUser(null);
            setAuthReady(true);
            return;
          }
          setCurrentUser({ id: member.id, name: member.name, email: member.email, role: member.role });
          if (member.role !== 'parent') setActiveRole(member.role);
        } catch {
          setCurrentUser(null);
        }
        setAuthReady(true);
      })();
    });

    return () => authData.subscription.unsubscribe();
  }, []);

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError(null);
      await seedDatabaseIfEmpty();
      const [
        settings, staff, teams, players, parents, subscriptions,
        attendance, matches, trainings, transactions, tournaments, videos, notifications,
        auditLogs, loginLogs,
      ] = await Promise.all([
        db.getSettings(),
        db.getStaff(), db.getTeams(), db.getPlayers(), db.getParents(),
        db.getSubscriptions(), db.getAttendance(), db.getMatches(),
        db.getTrainings(), db.getTransactions(), db.getTournaments(),
        db.getVideos(), db.getNotifications(),
        db.getAuditLogs(), db.getLoginAuditLogs(),
      ]);
      setData({
        settings, staff, teams, players, parents, subscriptions,
        attendance, matches, trainings, transactions, tournaments, videos, notifications,
        auditLogs, loginLogs,
      });
    } catch (err) {
      console.error('[load]', err);
      setLoadError('تعذر تحميل البيانات. يرجى المحاولة مرة أخرى. / Could not load your data. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentUser) loadAllData();
  }, [currentUser, loadAllData]);

  useEffect(() => {
    if (!currentUser) return;
    const tables = [
      'staff', 'teams', 'players', 'parents', 'subscriptions', 'attendance',
      'matches', 'trainings', 'transactions', 'tournaments', 'videos',
      'notifications', 'academy_settings',
    ];
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const handleChange = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => loadAllData(), 300);
    };
    const channels = tables.map((t) => db.subscribe(t, handleChange));
    return () => {
      if (debounce) clearTimeout(debounce);
      channels.forEach((ch) => supabaseUnsubscribe(ch));
    };
  }, [currentUser, loadAllData]);

  useEffect(() => {
    const updateClock = () => {
      try {
        const formatter = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-SA' : 'en-US', {
          timeZone: 'Asia/Riyadh',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit',
          hour12: true,
        });
        setCurrentTime(formatter.format(new Date()));
      } catch {
        setCurrentTime(new Date().toLocaleTimeString());
      }
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, [lang]);

  useEffect(() => { prefs.saveLang(lang); }, [lang]);
  useEffect(() => {
    prefs.saveDarkMode(darkMode);
    if (darkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    if (!currentUser || data.subscriptions.length === 0) return;
    const updated = generateReminderNotifications(data.subscriptions, data.players, data.notifications);
    if (updated.length !== data.notifications.length) {
      setData((prev) => ({ ...prev, notifications: updated }));
      db.syncNotifications(updated).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.subscriptions, data.players, currentUser]);

  /* ── Sync error handler ── */
  const handleSyncError = useCallback((err: unknown) => {
    const msg = err instanceof Error ? err.message : 'Sync failed';
    if (msg.includes('row-level security') || msg.includes('policy')) {
      setSyncError(lang === 'ar' ? 'ليس لديك صلاحية لإجراء هذا التعديل' : 'You do not have permission for this action');
    } else {
      setSyncError(lang === 'ar' ? 'حدث خطأ أثناء حفظ البيانات' : 'Failed to save data');
    }
    setTimeout(() => setSyncError(null), 5000);
    loadAllData();
  }, [lang, loadAllData]);

  const handleLogin = (user: CurrentUser) => {
    setCurrentUser(user);
    if (user.role !== 'parent') setActiveRole(user.role);
    setCurrentTab('dashboard');
  };

  const handleLogout = async () => {
    await signOut();
    setCurrentUser(null);
    setCurrentTab('dashboard');
    setData(EMPTY_DATA);
  };

  const handleResetDb = async () => {
    try {
      setLoading(true);
      await resetAndSeedDatabase();
      await loadAllData();
    } catch {
      setLoadError('Failed to reset database');
    } finally {
      setLoading(false);
    }
  };

  /* ---------- Data change handlers with proper error handling ---------- */

  const saveSettings = useCallback((s: SettingsType) => {
    setData((p) => ({ ...p, settings: s }));
    db.saveSettings(s).catch(handleSyncError);
  }, [handleSyncError]);
  const saveStaff = useCallback((s: StaffType[]) => {
    setData((p) => ({ ...p, staff: s }));
    db.syncStaff(s).catch(handleSyncError);
  }, [handleSyncError]);
  const saveTeams = useCallback((t: Team[]) => {
    setData((p) => ({ ...p, teams: t }));
    db.syncTeams(t).catch(handleSyncError);
  }, [handleSyncError]);
  const savePlayers = useCallback((p: Player[]) => {
    setData((prev) => ({ ...prev, players: p }));
    db.syncPlayers(p).catch(handleSyncError);
  }, [handleSyncError]);
  const saveParents = useCallback((p: Parent[]) => {
    setData((prev) => ({ ...prev, parents: p }));
    db.syncParents(p).catch(handleSyncError);
  }, [handleSyncError]);
  const saveSubscriptions = useCallback((s: Subscription[]) => {
    setData((p) => ({ ...p, subscriptions: s }));
    db.syncSubscriptions(s).catch(handleSyncError);
  }, [handleSyncError]);
  const saveAttendance = useCallback((a: Attendance[]) => {
    setData((p) => ({ ...p, attendance: a }));
    db.syncAttendance(a).catch(handleSyncError);
  }, [handleSyncError]);
  const saveMatches = useCallback((m: Match[]) => {
    setData((p) => ({ ...p, matches: m }));
    db.syncMatches(m).catch(handleSyncError);
  }, [handleSyncError]);
  const saveTrainings = useCallback((t: Training[]) => {
    setData((p) => ({ ...p, trainings: t }));
    db.syncTrainings(t).catch(handleSyncError);
  }, [handleSyncError]);
  const saveTransactions = useCallback((t: Transaction[]) => {
    setData((p) => ({ ...p, transactions: t }));
    db.syncTransactions(t).catch(handleSyncError);
  }, [handleSyncError]);
  const saveTournaments = useCallback((tn: TournamentType[]) => {
    setData((p) => ({ ...p, tournaments: tn }));
    db.syncTournaments(tn).catch(handleSyncError);
  }, [handleSyncError]);
  const saveVideos = useCallback((v: VideoType[]) => {
    setData((p) => ({ ...p, videos: v }));
    db.syncVideos(v).catch(handleSyncError);
  }, [handleSyncError]);

  const t = tr(lang);

  const viewTitles: Record<ViewId, string> = {
    dashboard: t.dashboard,
    approvals: t.approvals,
    players: t.players,
    parents: t.parents,
    teams: t.teams,
    staff: t.staff,
    subscriptions: t.subscriptions,
    attendance: t.attendance,
    schedules: t.schedules,
    tournaments: t.tournaments,
    videos: t.videos,
    reports: t.reports,
    'audit-logs': lang === 'ar' ? 'سجل التدقيق' : 'Audit Log',
    mobile: t.mobile,
    'ai-center': t.aiCenter,
    messages: t.messages,
    settings: t.settings,
  };

  const roleLabels: Record<Role, string> = {
    manager: 'المدير العام',
    accountant: 'المحاسب المالي',
    coach: 'المدرب الفني',
    receptionist: 'موظف الاستقبال',
    parent: 'ولي الأمر',
  };

  const renderView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <Dashboard players={data.players} subscriptions={data.subscriptions} matches={data.matches} transactions={data.transactions} staff={data.staff} teams={data.teams} parents={data.parents} setCurrentTab={setCurrentTab} activeRole={activeRole} lang={lang} />;
      case 'approvals':
        return <Approvals players={data.players} staff={data.staff} onPlayersChange={savePlayers} onStaffChange={saveStaff} activeRole={activeRole} lang={lang} />;
      case 'players':
        return <Players players={data.players} teams={data.teams} onPlayersChange={savePlayers} activeRole={activeRole} lang={lang} />;
      case 'parents':
        return <Parents parents={data.parents} players={data.players} teams={data.teams} subscriptions={data.subscriptions} onParentsChange={saveParents} activeRole={activeRole} lang={lang} />;
      case 'teams':
        return <Teams teams={data.teams} staff={data.staff} players={data.players} onTeamsChange={saveTeams} activeRole={activeRole} lang={lang} />;
      case 'staff':
        return <StaffView staff={data.staff} teams={data.teams} players={data.players} onStaffChange={saveStaff} activeRole={activeRole} lang={lang} />;
      case 'subscriptions':
        return <Subscriptions subscriptions={data.subscriptions} transactions={data.transactions} players={data.players} parents={data.parents} staff={data.staff} settings={data.settings} onSubscriptionsChange={saveSubscriptions} onTransactionsChange={saveTransactions} activeRole={activeRole} lang={lang} />;
      case 'attendance':
        return <AttendanceView players={data.players} teams={data.teams} attendance={data.attendance} onAttendanceChange={saveAttendance} activeRole={activeRole} lang={lang} />;
      case 'schedules':
        return <Schedules matches={data.matches} trainings={data.trainings} teams={data.teams} players={data.players} onMatchesChange={saveMatches} onTrainingsChange={saveTrainings} activeRole={activeRole} lang={lang} />;
      case 'tournaments':
        return <Tournaments tournaments={data.tournaments} onTournamentsChange={saveTournaments} activeRole={activeRole} lang={lang} />;
      case 'videos':
        return <Videos videos={data.videos} matches={data.matches} trainings={data.trainings} players={data.players} onVideosChange={saveVideos} activeRole={activeRole} lang={lang} />;
      case 'reports':
        return <Reports players={data.players} teams={data.teams} staff={data.staff} matches={data.matches} trainings={data.trainings} transactions={data.transactions} subscriptions={data.subscriptions} attendance={data.attendance} activeRole={activeRole} lang={lang} />;
      case 'audit-logs':
        return <AuditLogs auditLogs={data.auditLogs} loginLogs={data.loginLogs} activeRole={activeRole} lang={lang} />;
      case 'mobile':
        return <MobileView players={data.players} teams={data.teams} staff={data.staff} subscriptions={data.subscriptions} transactions={data.transactions} trainings={data.trainings} matches={data.matches} activeRole={activeRole} lang={lang} />;
      case 'ai-center':
        return <AICenter players={data.players} subscriptions={data.subscriptions} transactions={data.transactions} staff={data.staff} teams={data.teams} matches={data.matches} trainings={data.trainings} tournaments={data.tournaments} parents={data.parents} attendance={data.attendance} activeRole={activeRole} lang={lang} />;
      case 'messages':
        return <Messages players={data.players} teams={data.teams} subscriptions={data.subscriptions} activeRole={activeRole} lang={lang} />;
      case 'settings':
        return data.settings ? <SettingsView settings={data.settings} onSettingsChange={saveSettings} activeRole={activeRole} lang={lang} /> : null;
      default:
        return <Dashboard players={data.players} subscriptions={data.subscriptions} matches={data.matches} transactions={data.transactions} staff={data.staff} teams={data.teams} parents={data.parents} setCurrentTab={setCurrentTab} activeRole={activeRole} lang={lang} />;
    }
  };

  const unreadCount = useMemo(() => data.notifications.filter((n) => !n.read).length, [data.notifications]);

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (!currentUser) {
    return <Login onLogin={handleLogin} lang={lang} setLang={setLang} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="text-center">
          <Loader2 className="h-8 w-8 text-emerald-600 animate-spin mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{lang === 'ar' ? 'جاري تحميل البيانات...' : 'Loading data...'}</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <div className="text-center max-w-sm">
          <p className="text-sm font-black text-red-600 mb-2">{lang === 'ar' ? 'خطأ في تحميل البيانات' : 'Failed to load data'}</p>
          <p className="text-xs text-slate-500 mb-4">{loadError}</p>
          <button onClick={loadAllData} className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-bold cursor-pointer hover:bg-emerald-500 transition">
            {lang === 'ar' ? 'إعادة المحاولة' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-screen transition-colors duration-300 ${darkMode ? 'bg-slate-950 text-slate-100 dark' : 'bg-slate-50 text-slate-800'}`}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
    >
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        activeRole={activeRole}
        setActiveRole={setActiveRole}
        lang={lang}
        setLang={setLang}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
        currentUser={currentUser}
        onLogout={handleLogout}
        onResetDb={() => setShowResetConfirm(true)}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
      />

      <div className="flex-1 flex flex-col min-h-screen overflow-x-hidden">
        {/* Header */}
        <header className={`border-b py-3 sm:py-4 px-4 sm:px-6 lg:px-8 flex items-center justify-between shadow-sm shrink-0 transition-colors duration-300 ${
          darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'
        }`}>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            >
              <Menu className="h-6 w-6" />
            </button>
            <div>
              <h1 className={`text-sm sm:text-lg font-black tracking-tight leading-tight ${
                darkMode ? 'text-white' : 'text-slate-900'
              }`}>
                {viewTitles[currentTab]}
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-400 font-semibold mt-0.5 flex items-center gap-1.5">
                <Target className="h-3 w-3 text-emerald-500" />
                {t.academyName} · {roleLabels[activeRole]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
              <Clock className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 tabular-nums">{currentTime}</span>
            </div>

            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <Bell className="h-5 w-5 text-slate-500" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 h-4 min-w-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                  <div className={`absolute left-0 mt-2 w-80 rounded-2xl shadow-2xl border z-50 animate-fadeIn ${
                    darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'
                  }`}>
                    <div className={`px-4 py-3 border-b flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                      <h3 className="text-sm font-black text-slate-900 dark:text-white">{t.notifications}</h3>
                      {data.notifications.length > 0 && (
                        <button
                          onClick={() => {
                            const read = data.notifications.map((n) => ({ ...n, read: true }));
                            setData((p) => ({ ...p, notifications: read }));
                            db.syncNotifications(read).catch(() => {});
                          }}
                          className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer"
                        >
                          {t.markAllRead}
                        </button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {data.notifications.length === 0 ? (
                        <div className="py-8 text-center">
                          <Bell className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-xs text-slate-400 font-semibold">{t.noNotifications}</p>
                        </div>
                      ) : (
                        data.notifications.slice(0, 10).map((n) => (
                          <div key={n.id} className={`px-4 py-3 border-b last:border-0 ${darkMode ? 'border-slate-800/50' : 'border-slate-50'} ${!n.read ? 'bg-emerald-50/50 dark:bg-emerald-900/10' : ''}`}>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{n.title}</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>
                            <p className="text-[9px] text-slate-400 mt-1">{new Date(n.timestamp).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                {currentUser.name.charAt(0)}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-black text-slate-800 dark:text-white">{currentUser.name}</p>
                <p className="text-[10px] text-slate-400">{roleLabels[activeRole]}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Sync error toast */}
        {syncError && (
          <div className="mx-4 sm:mx-6 lg:mx-8 mt-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-center gap-2 animate-fadeIn">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
            <p className="text-xs font-bold text-red-700 dark:text-red-300 flex-1">{syncError}</p>
            <button onClick={() => setSyncError(null)} className="text-red-400 hover:text-red-600 text-xs font-bold cursor-pointer">&times;</button>
          </div>
        )}

        {/* Main content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <div className="max-w-7xl mx-auto animate-fadeIn">
            <ErrorBoundary lang={lang}>
              <Suspense fallback={<ViewLoader />}>
                {renderView()}
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={handleResetDb}
        title={t.resetDb}
        message={t.resetDbConfirm}
        confirmLabel="إعادة الضبط"
      />
    </div>
  );
}

/* ---------- Helpers ---------- */

function supabaseUnsubscribe(channel: ReturnType<typeof db.subscribe>) {
  try { supabase.removeChannel(channel); } catch { /* ignore */ }
}
