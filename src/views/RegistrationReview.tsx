import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge, FormField, inputCls, Modal } from '@/components/ui';
import { errorMessage, getApplications, registrationRpc, registrationStatus, type RegistrationApplication, type RegistrationDocument } from '@/lib/registrations';
import { supabase } from '@/lib/supabase';
import type { Lang, Player, Team } from '@/types';

function DocumentLink({ doc, ar }: { doc: RegistrationDocument; ar: boolean }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const { data, error } = await supabase.storage.from('player-documents').createSignedUrl(doc.storage_path, 300);
      if (active) { setUrl(data?.signedUrl || ''); setError(error ? (ar ? 'تعذر فتح الملف' : 'Unable to open file') : ''); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 240000);
    return () => { active = false; clearInterval(timer); };
  }, [doc.storage_path, ar]);
  return <span className="text-sm">{url ? <a className="text-emerald-700 underline" href={url} target="_blank" rel="noreferrer">{doc.file_name}</a> : error || (ar ? 'جارٍ تحميل الملف…' : 'Loading file…')}</span>;
}
function Assignment({ player, teams, ar, onSaved }: { player: Player; teams: Team[]; ar: boolean; onSaved: () => Promise<void> }) {
  const [team, setTeam] = useState(player.teamId);
  const [position, setPosition] = useState(player.position);
  const [jersey, setJersey] = useState(player.jerseyNumber || 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      await registrationRpc('finalize_registered_player', { p_player_id: player.id, p_team_id: team, p_position: position, p_jersey_number: jersey });
      await onSaved();
    } catch (e) { setError(errorMessage(e, ar)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="space-y-3 p-3 border rounded-lg dark:border-slate-700">
    <h4 className="font-bold">{player.name}</h4>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <fieldset disabled={busy} className="grid sm:grid-cols-3 gap-3">
      <FormField label={ar ? 'الفريق' : 'Team'}><select className={inputCls} required value={team} onChange={e => setTeam(e.target.value)}><option value="">—</option>{teams.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}</select></FormField>
      <FormField label={ar ? 'المركز' : 'Position'}><select className={inputCls} required value={position} onChange={e => setPosition(e.target.value)}><option value="">—</option>{['GK', 'DEF', 'MID', 'FWD'].map(p => <option key={p}>{p}</option>)}</select></FormField>
      <FormField label={ar ? 'رقم القميص' : 'Jersey number'}><input className={inputCls} type="number" required min={1} max={99} value={jersey} onChange={e => setJersey(Number(e.target.value))} /></FormField>
      <button className="bg-emerald-600 text-white rounded-lg px-4 py-2" type="submit">{ar ? 'حفظ وتفعيل اللاعب' : 'Save and activate player'}</button>
    </fieldset>
  </form>;
}
export function RegistrationReview({ lang, players, teams, onRefresh }: { lang: Lang; players: Player[]; teams: Team[]; onRefresh: () => Promise<void> }) {
  const ar = lang === 'ar';
  const [apps, setApps] = useState<RegistrationApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = apps.find(a => a.id === selectedId);
  const load = useCallback(async () => {
    try { setApps(await getApplications()); setError(''); }
    catch (e) { setError(errorMessage(e, lang === 'ar')); }
  }, [lang]);
  useEffect(() => { void load(); }, [load]);
  const action = async (status: 'approved' | 'under_review' | 'needs_info' | 'rejected') => {
    if (!selected || busy) return;
    if ((status === 'needs_info' || status === 'rejected') && !notes.trim()) { setError(ar ? 'اكتب سبب القرار لولي الأمر.' : 'Add a reason for the parent.'); return; }
    setBusy(true); setError('');
    try {
      if (status === 'approved') await registrationRpc('approve_registration_application', { p_application_id: selected.id });
      else await registrationRpc('review_registration_application', { p_application_id: selected.id, p_status: status, p_notes: notes.trim() || null });
      await load(); await onRefresh();
    } catch (e) { setError(errorMessage(e, ar)); }
    finally { setBusy(false); }
  };
  return <section className="space-y-4 border dark:border-slate-700 rounded-xl p-4 mb-8">
    <div className="flex justify-between items-center"><h3 className="font-black text-lg">{ar ? 'طلبات أولياء الأمور والأبناء' : 'Parent and child applications'}</h3><button aria-label={ar ? 'تحديث الطلبات' : 'Refresh applications'} onClick={() => void load()}><RefreshCw className="h-4 w-4" /></button></div>
    {error && !selected && <p role="alert" className="text-red-600 text-sm">{error}</p>}
    {!apps.length && <p className="text-slate-500 text-sm">{ar ? 'لا توجد طلبات تسجيل.' : 'No registration applications.'}</p>}
    {apps.filter(a => a.status !== 'draft').map(app => <button key={app.id} className="w-full flex flex-wrap items-center justify-between gap-3 p-3 border dark:border-slate-700 rounded-lg text-start hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => { setSelectedId(app.id); setNotes(app.review_notes || ''); setError(''); }}><span><strong>{app.parent_full_name}</strong><span className="block text-xs text-slate-500">{app.children.map(c => c.full_name).join('، ')}</span></span><Badge>{registrationStatus(app.status, ar)}</Badge></button>)}
    <Modal open={!!selected} onClose={() => { if (!busy) setSelectedId(null); }} title={ar ? 'مراجعة طلب التسجيل' : 'Review registration'} size="xl">
      {selected && <div className="space-y-4">
        {error && <p role="alert" className="text-red-600 text-sm">{error}</p>}
        <h4 className="font-bold">{selected.parent_full_name} · {selected.parent_national_id}</h4><p className="text-sm" dir="ltr">{selected.parent_email} · {selected.parent_phone}</p>
        {selected.children.map(child => <article key={child.id} className="border dark:border-slate-700 rounded-lg p-3 space-y-2"><h4 className="font-bold">{child.full_name}</h4><p className="text-sm">CPR: {child.national_id} · {child.birth_date} · {child.blood_type || '—'}</p>{child.parent_notes && <p className="text-sm">{child.parent_notes}</p>}<div className="flex flex-wrap gap-3">{selected.documents.filter(d => d.child_id === child.id).map(doc => <DocumentLink key={doc.id} doc={doc} ar={ar} />)}</div></article>)}
        {['pending', 'under_review', 'needs_info'].includes(selected.status) && <><FormField label={ar ? 'ملاحظات القرار' : 'Review notes'}><textarea className={inputCls} value={notes} onChange={e => setNotes(e.target.value)} disabled={busy} /></FormField><div className="flex flex-wrap gap-3">
          {selected.status !== 'needs_info' && <button disabled={busy} className="bg-emerald-600 text-white px-4 py-2 rounded-lg disabled:opacity-50" onClick={() => void action('approved')}>{ar ? 'قبول الطلب وإنشاء اللاعبين' : 'Approve and create players'}</button>}
          <button disabled={busy} className="bg-amber-100 text-amber-900 px-4 py-2 rounded-lg disabled:opacity-50" onClick={() => void action('needs_info')}>{ar ? 'طلب استكمال البيانات' : 'Request information'}</button>
          <button disabled={busy} className="text-red-600 px-4 py-2 rounded-lg disabled:opacity-50" onClick={() => void action('rejected')}>{ar ? 'رفض الطلب' : 'Reject application'}</button>
        </div></>}
        {selected.status === 'approved' && <><p className="text-sm text-emerald-700">{ar ? 'تم قبول الطلب. أكمل توزيع اللاعبين وتفعيلهم.' : 'Application approved. Complete player assignment and activation.'}</p>{selected.children.map(c => players.find(p => p.id === c.approved_player_id)).filter((p): p is Player => !!p && p.status !== 'active').map(player => <Assignment key={player.id} player={player} teams={teams} ar={ar} onSaved={onRefresh} />)}</>}
      </div>}
    </Modal>
  </section>;
}
