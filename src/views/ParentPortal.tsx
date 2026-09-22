import { useCallback, useEffect, useState } from 'react';
import { LogOut, Plus, RefreshCw } from 'lucide-react';
import { Registration } from '@/views/Registration';
import { Badge, Modal } from '@/components/ui';
import { errorMessage, fetchMyApplications } from '@/lib/registration';
import type { RegistrationApplication } from '@/types';
import { planLabel } from '@/lib/i18n';
import type { Attendance, CurrentUser, Lang, Player, Subscription } from '@/types';

export function ParentPortal({ user, players, subscriptions, attendance, lang, setLang, onLogout, onRefresh, openRegistration = false }: {
  openRegistration?: boolean; user: CurrentUser; players: Player[]; subscriptions: Subscription[]; attendance: Attendance[]; lang: Lang;
  setLang: (lang: Lang) => void; onLogout: () => void; onRefresh: () => Promise<void>;
}) {
  const ar = lang === 'ar';
  const text = (a: string, e: string) => ar ? a : e;
  const [apps, setApps] = useState<RegistrationApplication[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [editor, setEditor] = useState<RegistrationApplication | 'new' | null>(openRegistration ? 'new' : null);
  const load = useCallback(async () => {
    try { setApps(await fetchMyApplications()); setError(''); setReady(true); }
    catch (e) { setError(errorMessage(e, lang === 'ar')); }
  }, [lang]);
  useEffect(() => {
    void load();
    const refreshVisible = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = setInterval(refreshVisible, 60000);
    window.addEventListener('focus', refreshVisible);
    return () => { clearInterval(timer); window.removeEventListener('focus', refreshVisible); };
  }, [load]);
  const statusLabel = (status: RegistrationApplication['status']) => ({ draft: text('مسودة', 'Draft'), pending: text('بانتظار المراجعة', 'Pending review'), under_review: text('قيد المراجعة', 'Under review'), needs_info: text('يحتاج استكمال', 'More information needed'), approved: text('مقبول', 'Approved'), rejected: text('مرفوض', 'Rejected') })[status];
  const refresh = async () => { await load(); await onRefresh(); };
  return <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4 sm:p-8" dir={ar ? 'rtl' : 'ltr'}>
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-black">{text('بوابة ولي الأمر', 'Parent portal')}</h1><p className="text-sm text-slate-500">{user.name}</p></div><div className="flex gap-4 items-center text-sm"><button onClick={() => setLang(ar ? 'en' : 'ar')}>{ar ? 'English' : 'العربية'}</button><button onClick={onLogout} className="flex gap-1 items-center"><LogOut className="h-4 w-4" />{text('خروج', 'Sign out')}</button></div></header>
      {error && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-bold">{text('الأبناء', 'Children')}</h2><div className="flex gap-3"><button onClick={() => void refresh()} aria-label={text('تحديث', 'Refresh')}><RefreshCw className="h-5 w-5" /></button><button disabled={!ready} onClick={() => setEditor('new')} className="flex gap-2 items-center bg-emerald-600 text-white rounded-lg px-4 py-2 disabled:opacity-50"><Plus className="h-4 w-4" />{text('طلب تسجيل أبناء', 'Register children')}</button></div></div>
      {!players.length && <p className="text-slate-500">{text('ستظهر بيانات الأبناء هنا بعد اعتماد الطلب وربط الحساب.', 'Your children will appear here after the academy approves the application and links your account.')}</p>}
      <div className="grid md:grid-cols-2 gap-4">{players.map(player => <article key={player.id} className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-xl p-5 space-y-3">
        <h3 className="font-black text-lg">{player.name}</h3><Badge color={player.status === 'active' ? 'green' : 'amber'}>{player.status === 'active' ? text('نشط', 'Active') : text('بانتظار التوزيع والتفعيل', 'Awaiting assignment and activation')}</Badge>
        <p className="text-sm">{text('الحضور المسجل', 'Recorded attendance')}: {attendance.filter(a => a.playerId === player.id && a.status === 'present').length} / {attendance.filter(a => a.playerId === player.id).length}</p>
        <h4 className="font-bold text-sm">{text('الاشتراكات', 'Subscriptions')}</h4>
        {subscriptions.filter(s => s.playerId === player.id).map(sub => <div key={sub.id} className="flex flex-wrap justify-between gap-2 text-sm border-t dark:border-slate-700 pt-2"><span>{planLabel(sub.planType, lang)} · {sub.amount} {text('د.ب', 'BHD')}</span><Badge color={sub.status === 'paid' ? 'green' : 'amber'}>{sub.status === 'paid' ? text('مدفوع', 'Paid') : text('غير مدفوع', 'Unpaid')}</Badge><span className="w-full text-xs text-slate-500" dir="ltr">{sub.startDate} — {sub.endDate}</span></div>)}
      </article>)}</div>
      <h2 className="text-lg font-bold">{text('طلبات التسجيل', 'Registration applications')}</h2>
      {!ready && !error && <p role="status">{text('جارٍ التحميل…', 'Loading…')}</p>}
      {apps.map(app => <article key={app.id} className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-700 p-4 space-y-2"><div className="flex justify-between gap-3"><p className="font-bold">{app.children.map(c => c.fullName).join('، ')}</p><Badge>{statusLabel(app.status)}</Badge></div>{app.reviewNotes && <p className="text-sm text-amber-700">{app.reviewNotes}</p>}{['draft', 'needs_info'].includes(app.status) && <button className="text-emerald-700 font-bold text-sm" onClick={() => setEditor(app)}>{text('استكمال الطلب', 'Continue application')}</button>}</article>)}
      <Modal open={editor !== null} onClose={() => setEditor(null)} title={text('تسجيل الأبناء', 'Children registration')} size="xl">
        {editor && <Registration key={editor === 'new' ? 'new' : editor.id} initial={editor === 'new' ? undefined : editor} lang={lang} onSaved={refresh} onExit={() => setEditor(null)} />}
      </Modal>
    </div>
  </main>;
}
