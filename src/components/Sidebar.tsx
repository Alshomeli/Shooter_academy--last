import {
  LayoutDashboard, ShieldCheck, Users, UsersRound,
  Trophy, Dumbbell, Wallet, ClipboardCheck, CalendarDays,
  BarChart3, Sparkles, Settings as SettingsIcon,
  LogOut, Moon, Sun, RotateCcw, X, Medal, Film, ScrollText, Send,
} from 'lucide-react';
import type { CurrentUser, Lang, Role, ViewId } from '@/types';
import { tr } from '@/lib/i18n';

interface SidebarProps {
  currentTab: ViewId;
  setCurrentTab: (v: ViewId) => void;
  activeRole: Role;
  setActiveRole: (r: Role) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  currentUser: CurrentUser;
  onLogout: () => void;
  onResetDb: () => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

interface NavItem {
  id: ViewId;
  label: string;
  icon: typeof LayoutDashboard;
  allowedRoles: Role[];
}

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'manager', label: 'مدير النظام' },
  { value: 'accountant', label: 'المحاسب المالي' },
  { value: 'coach', label: 'الكابتن / المدرب' },
  { value: 'receptionist', label: 'موظف الاستقبال' },
];

export function Sidebar({
  currentTab, setCurrentTab, activeRole, lang, setLang,
  darkMode, setDarkMode, currentUser, onLogout, onResetDb, mobileOpen, setMobileOpen,
}: SidebarProps) {
  const t = tr(lang);

  const navItems: NavItem[] = [
    { id: 'dashboard', label: t.dashboard, icon: LayoutDashboard, allowedRoles: ['manager', 'accountant', 'coach', 'receptionist'] },
    { id: 'approvals', label: t.approvals, icon: ShieldCheck, allowedRoles: ['manager'] },
    { id: 'players', label: t.players, icon: Users, allowedRoles: ['manager', 'receptionist', 'coach'] },
    { id: 'parents', label: t.parents, icon: UsersRound, allowedRoles: ['manager', 'receptionist', 'coach', 'accountant'] },
    { id: 'teams', label: t.teams, icon: Trophy, allowedRoles: ['manager', 'coach', 'receptionist'] },
    { id: 'staff', label: t.staff, icon: Dumbbell, allowedRoles: ['manager'] },
    { id: 'subscriptions', label: t.subscriptions, icon: Wallet, allowedRoles: ['manager', 'accountant', 'receptionist'] },
    { id: 'attendance', label: t.attendance, icon: ClipboardCheck, allowedRoles: ['manager', 'coach', 'receptionist'] },
    { id: 'schedules', label: t.schedules, icon: CalendarDays, allowedRoles: ['manager', 'coach'] },
    { id: 'tournaments', label: t.tournaments, icon: Medal, allowedRoles: ['manager', 'coach', 'receptionist'] },
    { id: 'videos', label: t.videos, icon: Film, allowedRoles: ['manager', 'coach'] },
    { id: 'reports', label: t.reports, icon: BarChart3, allowedRoles: ['manager', 'accountant', 'coach', 'receptionist'] },
    { id: 'audit-logs', label: lang === 'ar' ? 'سجل التدقيق' : 'Audit Log', icon: ScrollText, allowedRoles: ['manager'] },

    { id: 'messages', label: t.messages, icon: Send, allowedRoles: ['manager', 'coach', 'receptionist', 'accountant'] },
    { id: 'ai-center', label: t.aiCenter, icon: Sparkles, allowedRoles: ['manager', 'accountant', 'coach', 'receptionist'] },
    { id: 'settings', label: t.settings, icon: SettingsIcon, allowedRoles: ['manager'] },
  ];

  const visibleItems = navItems.filter((item) => item.allowedRoles.includes(activeRole));

  const handleNav = (id: ViewId) => {
    setCurrentTab(id);
    setMobileOpen(false);
  };



  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        id="sidebar"
        className={`fixed lg:relative inset-y-0 right-0 z-50 lg:z-auto w-72 min-h-screen flex flex-col justify-between shrink-0 shadow-2xl transition-all duration-300 ${
          mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        } ${darkMode ? 'bg-slate-950 text-slate-100 border-l border-slate-900' : 'bg-slate-900 text-white border-l border-slate-800'}`}
      >
        <div>
          {/* Logo header */}
          <div className="p-6 border-b border-slate-800 flex items-center gap-3 bg-emerald-950/20">
            <div className="relative group shrink-0">
              <div className="absolute -inset-0.5 bg-gradient-to-tr from-emerald-500 to-amber-500 rounded-full blur opacity-40 group-hover:opacity-75 transition duration-1000" />
              <div className="relative w-13 h-13 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg ring-2 ring-emerald-400/30">
                <img src="/copilot_image_1776165482483-300x300.png" alt="شعار الأكاديمية" className="h-10 w-10 object-contain" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-black text-base text-emerald-400 tracking-tight leading-tight">{t.academyShort}</h1>
              <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5 uppercase">SHOOTER ACADEMY</p>
              <p className="text-[9px] text-emerald-500 font-semibold mt-0.5">{t.systemTitle}</p>
            </div>
            <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Signed-in identity and permission level (assigned by a manager) */}
          <div className="p-4 mx-4 my-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <div className="w-full bg-slate-950 text-white text-[11px] font-semibold py-2 px-2.5 rounded-lg border border-slate-700">
              {ROLE_OPTIONS.find((r) => r.value === activeRole)?.label ?? activeRole}
            </div>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-slate-400 font-semibold">{t.active}: {currentUser.name.split(' ')[0]}</span>
            </div>
          </div>

          {/* Nav items */}
          <nav className="px-3 pb-4 space-y-0.5 overflow-y-auto max-h-[calc(100vh-460px)]">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNav(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer text-right ${
                    active
                      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Footer controls */}
        <div className="p-4 border-t border-slate-800 space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 transition cursor-pointer"
            >
              {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {darkMode ? 'فاتح' : 'داكن'}
            </button>
            <button
              onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold bg-slate-800/50 hover:bg-slate-700/50 text-slate-300 transition cursor-pointer"
            >
              {lang === 'ar' ? 'EN' : 'ع'}
              {lang === 'ar' ? ' English' : ' العربية'}
            </button>
          </div>
          <button
            onClick={onResetDb}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold bg-amber-900/30 hover:bg-amber-900/50 text-amber-400 border border-amber-800/30 transition cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t.resetDb}
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold bg-red-900/30 hover:bg-red-900/50 text-red-400 border border-red-800/30 transition cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            {t.logout}
          </button>
        </div>
      </aside>
    </>
  );
}
