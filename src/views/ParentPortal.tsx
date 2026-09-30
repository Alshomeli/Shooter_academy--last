import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clipboard, CreditCard, FileUp, LogOut, Plus, RefreshCw, UserRound } from 'lucide-react';
import { Registration } from '@/views/Registration';
import { Badge, Modal } from '@/components/ui';
import { errorMessage, fetchMyApplications } from '@/lib/registration';
import type { RegistrationApplication } from '@/types';
import { planLabel } from '@/lib/i18n';
import type { Attendance, CurrentUser, Lang, PaymentProof, Player, PlayerEvaluation, Settings, Subscription } from '@/types';
import { db } from '@/lib/store';
import { tr } from '@/lib/i18n';

export function ParentPortal({ user, players, subscriptions, attendance, evaluations, settings, lang, setLang, onLogout, onRefresh, openRegistration = false }: {
  openRegistration?: boolean; user: CurrentUser; players: Player[]; subscriptions: Subscription[]; attendance: Attendance[]; evaluations: PlayerEvaluation[]; settings: Settings; lang: Lang;
  setLang: (lang: Lang) => void; onLogout: () => void; onRefresh: () => Promise<void>;
}) {
  const ar = lang === 'ar';
  const text = (a: string, e: string) => ar ? a : e;
  const [apps, setApps] = useState<RegistrationApplication[]>([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [registrationBusy, setRegistrationBusy] = useState(false);
  const [editor, setEditor] = useState<RegistrationApplication | 'new' | null>(openRegistration ? 'new' : null);
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id || '');
  const [paymentProofs, setPaymentProofs] = useState<PaymentProof[]>([]);
  const [payingSubscription, setPayingSubscription] = useState<Subscription | null>(null);
  const [paymentFile, setPaymentFile] = useState<File | null>(null);
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState('');
  const [paymentBusy, setPaymentBusy] = useState(false);
  const selectedPlayer = players.find((p) => p.id === selectedPlayerId) || players[0];
  const playerSubscriptions = selectedPlayer ? subscriptions.filter((s) => s.playerId === selectedPlayer.id).sort((a,b) => b.startDate.localeCompare(a.startDate)) : [];
  const playerAttendance = selectedPlayer ? attendance.filter((a) => a.playerId === selectedPlayer.id) : [];
  const playerEvaluations = selectedPlayer ? evaluations.filter((e) => e.playerId === selectedPlayer.id && e.status === 'published').sort((a,b) => b.evaluationDate.localeCompare(a.evaluationDate)) : [];
  const load = useCallback(async () => {
    try { const [myApps, proofs] = await Promise.all([fetchMyApplications(), db.getPaymentProofs()]); setApps(myApps); setPaymentProofs(proofs); setError(''); setReady(true); }
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
  const submitProof = async () => {
    if (!payingSubscription || !selectedPlayer || !paymentFile) return;
    try {
      setPaymentBusy(true); setError('');
      await db.submitPaymentProof(payingSubscription, selectedPlayer.id, transferDate, paymentFile, paymentNote);
      setPayingSubscription(null); setPaymentFile(null); setPaymentNote('');
      await refresh();
    } catch (e) { setError(errorMessage(e, ar)); }
    finally { setPaymentBusy(false); }
  };
  const proofStatus = (status: PaymentProof['status']) => ({
    pending: text('بانتظار مراجعة الإدارة', 'Pending academy review'),
    approved: text('تم اعتماد الدفعة', 'Payment approved'),
    rejected: text('مرفوض', 'Rejected'),
    needs_info: text('يحتاج استكمال', 'More information needed'),
  })[status];
  return <main className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 p-4 sm:p-8" dir={ar ? 'rtl' : 'ltr'}>
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-black">{text('بوابة ولي الأمر', 'Parent portal')}</h1><p className="text-sm text-slate-500">{user.name}</p></div><div className="flex gap-4 items-center text-sm"><button onClick={() => setLang(ar ? 'en' : 'ar')}>{ar ? 'English' : 'العربية'}</button><button onClick={onLogout} className="flex gap-1 items-center"><LogOut className="h-4 w-4" />{text('خروج', 'Sign out')}</button></div></header>
      {error && <p role="alert" className="text-red-700 bg-red-50 p-3 rounded-lg">{error}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-lg font-bold">{text('الأبناء', 'Children')}</h2><div className="flex gap-3"><button onClick={() => void refresh()} aria-label={text('تحديث', 'Refresh')}><RefreshCw className="h-5 w-5" /></button><button disabled={!ready} onClick={() => setEditor('new')} className="flex gap-2 items-center bg-emerald-600 text-white rounded-lg px-4 py-2 disabled:opacity-50"><Plus className="h-4 w-4" />{text('طلب تسجيل أبناء', 'Register children')}</button></div></div>
      {!players.length && <p className="text-slate-500">{text('ستظهر بيانات الأبناء هنا بعد اعتماد الطلب وربط الحساب.', 'Your children will appear here after the academy approves the application and links your account.')}</p>}
      {players.length > 0 && <div className="grid lg:grid-cols-[260px_1fr] gap-5">
        <aside className="space-y-2">
          {players.map((player) => <button key={player.id} onClick={() => setSelectedPlayerId(player.id)} className={`w-full text-start rounded-2xl border p-4 transition ${selectedPlayer?.id === player.id ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/20' : 'bg-white dark:bg-slate-900 dark:border-slate-700'}`}>
            <div className="flex items-center gap-3"><div className="h-11 w-11 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center"><UserRound className="h-5 w-5" /></div><div><p className="font-black">{player.name}</p><p className="text-xs text-slate-500">#{player.jerseyNumber || '—'} · {player.position || text('لم يحدد المركز','Position pending')}</p></div></div>
          </button>)}
        </aside>
        {selectedPlayer && <section className="space-y-5">
          <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-2xl p-5">
            <div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-xl font-black">{selectedPlayer.name}</h2><p className="text-sm text-slate-500">{text('ملف اللاعب','Player profile')}</p></div><Badge color={selectedPlayer.status === 'active' ? 'green' : 'amber'}>{selectedPlayer.status === 'active' ? text('نشط','Active') : text('غير نشط','Inactive')}</Badge></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-xs text-slate-500">{text('الحضور','Attendance')}</p><p className="font-black">{playerAttendance.filter(a=>a.status==='present').length}/{playerAttendance.length}</p></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-xs text-slate-500">{text('التقييمات','Evaluations')}</p><p className="font-black">{playerEvaluations.length}</p></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-xs text-slate-500">{text('الاشتراكات','Subscriptions')}</p><p className="font-black">{playerSubscriptions.length}</p></div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 p-3"><p className="text-xs text-slate-500">{text('غير المدفوع','Unpaid')}</p><p className="font-black">{playerSubscriptions.filter(s=>s.status==='unpaid').length}</p></div>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-emerald-600"/><h3 className="font-black">{text('الاشتراكات والمدفوعات','Subscriptions & payments')}</h3></div>
            {playerSubscriptions.map((sub) => {
              const proof = paymentProofs.find((p) => p.subscriptionId === sub.id && ['pending','needs_info','approved'].includes(p.status));
              return <div key={sub.id} className="border-t dark:border-slate-700 pt-3 flex flex-wrap items-center justify-between gap-3">
                <div><p className="font-bold text-sm">{planLabel(sub.planType,lang)} · {sub.amount} {text('د.ب','BHD')}</p><p className="text-xs text-slate-500" dir="ltr">{sub.startDate} — {sub.endDate}</p></div>
                <div className="flex items-center gap-2"><Badge color={sub.status==='paid'?'green':'amber'}>{sub.status==='paid'?text('مدفوع','Paid'):text('غير مدفوع','Unpaid')}</Badge>
                {proof && <Badge color={proof.status==='approved'?'green':'amber'}>{proofStatus(proof.status)}</Badge>}
                {sub.status==='unpaid' && !proof && <button onClick={()=>setPayingSubscription(sub)} className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold">{text('دفع الاشتراك','Pay subscription')}</button>}</div>
              </div>;
            })}
          </div>

          {playerEvaluations.length > 0 && <div className="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-2xl p-5 space-y-3"><h3 className="font-black">{tr(lang).playerEvaluations}</h3>
            {playerEvaluations.slice(0,5).map((ev)=><div key={ev.id} className="border-t dark:border-slate-700 pt-3"><div className="flex justify-between"><span className="text-xs text-slate-500">{ev.evaluationDate}</span>{ev.overallScore!=null&&<strong className="text-emerald-600">{ev.overallScore.toFixed(1)}/5</strong>}</div>{ev.strengths&&<p className="text-sm mt-1">{ev.strengths}</p>}{ev.coachRecommendation&&<p className="text-xs text-blue-600 mt-1">{ev.coachRecommendation}</p>}</div>)}
          </div>}
        </section>}
      </div>}
      <h2 className="text-lg font-bold">{text('طلبات التسجيل', 'Registration applications')}</h2>
      {!ready && !error && <p role="status">{text('جارٍ التحميل…', 'Loading…')}</p>}
      {apps.map(app => <article key={app.id} className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-700 p-4 space-y-2"><div className="flex justify-between gap-3"><p className="font-bold">{app.children.map(c => c.fullName).join('، ')}</p><Badge>{statusLabel(app.status)}</Badge></div>{app.reviewNotes && <p className="text-sm text-amber-700">{app.reviewNotes}</p>}{['draft', 'needs_info'].includes(app.status) && <button className="text-emerald-700 font-bold text-sm" onClick={() => setEditor(app)}>{text('استكمال الطلب', 'Continue application')}</button>}</article>)}
      <Modal open={!!payingSubscription} closeDisabled={paymentBusy} onClose={() => !paymentBusy && setPayingSubscription(null)} title={text('إثبات دفع الاشتراك','Subscription payment proof')}>
        {payingSubscription && <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 p-4"><p className="text-sm text-slate-500">{text('المبلغ المطلوب','Amount due')}</p><p className="text-2xl font-black">{payingSubscription.amount} {text('د.ب','BHD')}</p></div>
          {settings.benefitIban ? <div className="rounded-xl border dark:border-slate-700 p-4"><p className="text-xs text-slate-500">{text('IBAN للتحويل عبر Benefit','IBAN for Benefit transfer')}</p><div className="flex items-center justify-between gap-3 mt-1"><code className="font-bold break-all" dir="ltr">{settings.benefitIban}</code><button onClick={()=>navigator.clipboard.writeText(settings.benefitIban || '')} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"><Clipboard className="h-4 w-4"/></button></div>{settings.benefitAccountName&&<p className="text-xs mt-2">{settings.benefitAccountName}</p>}</div> : <div className="rounded-xl bg-amber-50 text-amber-800 p-4 text-sm font-bold">{text('لم تضف الإدارة رقم IBAN للدفع بعد.','The academy has not configured the payment IBAN yet.')}</div>}
          <p className="text-sm text-slate-600 dark:text-slate-300">{ar ? settings.paymentInstructionsAr : settings.paymentInstructionsEn}</p>
          <label className="block text-sm font-bold">{text('تاريخ التحويل','Transfer date')}<input type="date" value={transferDate} onChange={e=>setTransferDate(e.target.value)} className="mt-1 w-full rounded-lg border dark:border-slate-700 bg-transparent p-2"/></label>
          <label className="block text-sm font-bold">{text('صورة/إيصال التحويل','Transfer screenshot / receipt')}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setPaymentFile(e.target.files?.[0]||null)} className="mt-1 block w-full text-sm"/></label>
          <label className="block text-sm font-bold">{text('ملاحظة (اختياري)','Note (optional)')}<textarea value={paymentNote} onChange={e=>setPaymentNote(e.target.value)} className="mt-1 w-full rounded-lg border dark:border-slate-700 bg-transparent p-2"/></label>
          <button disabled={!settings.benefitIban || !paymentFile || paymentBusy} onClick={()=>void submitProof()} className="w-full flex justify-center items-center gap-2 rounded-xl bg-emerald-600 text-white font-black py-3 disabled:opacity-50"><FileUp className="h-4 w-4"/>{paymentBusy?text('جارٍ الرفع...','Uploading...'):text('إرسال إثبات الدفع للإدارة','Send proof to academy')}</button>
          <p className="text-xs text-slate-500 flex gap-1"><CheckCircle2 className="h-4 w-4 shrink-0"/>{text('لن يعتبر الاشتراك مدفوعًا حتى تراجع الإدارة الإثبات وتعتمده.','The subscription remains unpaid until the academy reviews and approves the proof.')}</p>
        </div>}
      </Modal>
      <Modal open={editor !== null} closeDisabled={registrationBusy} onClose={() => { if (!registrationBusy) setEditor(null); }} title={text('تسجيل الأبناء', 'Children registration')} size="xl">
        {registrationBusy && <p role="status" className="mb-3 text-sm text-slate-500">{text('انتظر اكتمال الحفظ أو رفع الملفات قبل إغلاق الطلب.', 'Wait for saving or uploads to finish before closing the application.')}</p>}
        {editor && <Registration key={editor === 'new' ? 'new' : editor.id} initial={editor === 'new' ? undefined : editor} lang={lang} onSaved={refresh} onBusyChange={setRegistrationBusy} onExit={() => { if (!registrationBusy) setEditor(null); }} />}
      </Modal>
    </div>
  </main>;
}
