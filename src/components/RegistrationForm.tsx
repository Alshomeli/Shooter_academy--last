import { useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { errorMessage, registrationRpc, type RegistrationApplication } from '@/lib/registrations';
import { FormField, inputCls } from '@/components/ui';
import type { Lang } from '@/types';

type ChildForm = { clientKey: string; childId?: string; fullName: string; nationalId: string; birthDate: string; bloodType: string; notes: string; photo?: File; hasPhoto?: boolean };
const blankChild = (): ChildForm => ({ clientKey: crypto.randomUUID(), fullName: '', nationalId: '', birthDate: '', bloodType: '', notes: '' });
export function RegistrationForm({ initial, email, lang, onSaved }: { initial?: RegistrationApplication; email: string; lang: Lang; onSaved: () => Promise<void> }) {
  const ar = lang === 'ar';
  const text = (a: string, e: string) => ar ? a : e;
  const [appId, setAppId] = useState(initial?.id);
  const [requestId] = useState(() => crypto.randomUUID());
  const [parent, setParent] = useState({ fullName: initial?.parent_full_name || '', nationalId: initial?.parent_national_id || '',
    phone: initial?.parent_phone || '', whatsapp: initial?.parent_whatsapp || '', email,
    nationality: initial?.parent_nationality || '', occupation: initial?.parent_occupation || '',
    workplace: initial?.parent_workplace || '', address: initial?.parent_address || '', notes: initial?.parent_notes || '' });
  const [children, setChildren] = useState<ChildForm[]>(() => initial ? initial.children.map(c => ({
    clientKey: c.client_key || c.id, childId: c.id, fullName: c.full_name, nationalId: c.national_id, birthDate: c.birth_date,
    bloodType: c.blood_type || '', notes: c.parent_notes || '', hasPhoto: initial.documents.some(d => d.child_id === c.id && d.file_category === 'photo'),
  })) : [blankChild()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const uploads = useRef(new Map<File, { path: string; uploaded: boolean }>());
  const updateChild = (index: number, change: Partial<ChildForm>) => setChildren(list => list.map((c, i) => i === index ? { ...c, ...change } : c));
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      if (children.some(c => !c.photo && !c.hasPhoto)) throw new Error(text('أرفق صورة شخصية لكل لاعب.', 'Attach a profile photo for every child.'));
      let id = appId;
      let savedChildren = children;
      const payload = children.map(({ clientKey, childId, fullName, nationalId, birthDate, bloodType, notes }) => ({ clientKey, childId, fullName, nationalId, birthDate, bloodType, notes }));
      if (!id) {
        const draft = await registrationRpc('create_registration_draft', { p_parent: { ...parent, requestId }, p_children: payload }) as { applicationId: string; children: { clientKey: string; childId: string }[] };
        id = draft.applicationId;
        savedChildren = children.map(c => ({ ...c, childId: draft.children.find(d => d.clientKey === c.clientKey)?.childId }));
        if (savedChildren.some(c => !c.childId)) throw new Error('Could not match saved children. Refresh to resume the draft.');
        setAppId(id); setChildren(savedChildren);
      } else {
        await registrationRpc('update_registration_draft', { p_application_id: id, p_parent: parent, p_children: payload });
      }
      for (const child of savedChildren) {
        if (!child.photo) continue;
        const file = child.photo;
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5_000_000) throw new Error(text('استخدم صورة JPG أو PNG أو WebP، أقل من 5 ميجابايت.', 'Use JPG, PNG or WebP under 5 MB.'));
        let upload = uploads.current.get(file);
        if (!upload) {
          upload = { path: `applications/${id}/${child.childId}/${crypto.randomUUID()}.${file.type.split('/')[1]}`, uploaded: false };
          uploads.current.set(file, upload);
        }
        if (!upload.uploaded) {
          const { error: uploadError } = await supabase.storage.from('player-documents').upload(upload.path, file, { contentType: file.type });
          if (uploadError && !('statusCode' in uploadError && String(uploadError.statusCode) === '409')) throw uploadError;
          upload.uploaded = true;
        }
        await registrationRpc('add_registration_document', { p_application_id: id, p_child_id: child.childId,
          p_storage_path: upload.path, p_file_name: file.name, p_mime_type: file.type, p_file_category: 'photo', p_document_type: 'profile_photo', p_file_size: file.size });
      }
      await registrationRpc('submit_registration_application', { p_application_id: id });
      await onSaved();
    } catch (e) { setError(errorMessage(e, ar)); }
    finally { setBusy(false); }
  };
  return <form onSubmit={save} className="space-y-5">
    {initial?.review_notes && <p className="rounded-lg bg-amber-50 p-3 text-amber-900">{initial.review_notes}</p>}
    {error && <p role="alert" className="p-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</p>}
    <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
      <h3 className="font-black">{text('بيانات ولي الأمر', 'Parent details')}</h3>
      <div className="grid sm:grid-cols-2 gap-4">
        {([['fullName', 'الاسم الكامل', 'Full name', true], ['nationalId', 'الرقم الشخصي / CPR', 'National ID / CPR', true], ['phone', 'رقم الهاتف', 'Phone', true], ['whatsapp', 'واتساب', 'WhatsApp', false], ['nationality', 'الجنسية', 'Nationality', false], ['occupation', 'المهنة', 'Occupation', false], ['workplace', 'جهة العمل', 'Workplace', false], ['address', 'العنوان', 'Address', false]] as const).map(([key, a, e, required]) =>
          <FormField key={key} label={text(a, e)}><input aria-label={text(a, e)} className={inputCls} required={required} minLength={required ? 2 : undefined} value={parent[key]} onChange={e => setParent({ ...parent, [key]: e.target.value })} /></FormField>)}
        <FormField label={text('البريد الإلكتروني المؤكد', 'Verified email')}><input className={inputCls} dir="ltr" readOnly value={parent.email} /></FormField>
      </div>
      {children.map((child, index) => <section key={child.clientKey} className="border dark:border-slate-700 rounded-xl p-4 space-y-4">
        <div className="flex justify-between items-center"><h3 className="font-bold">{text('اللاعب', 'Child')} {index + 1}</h3>{!appId && children.length > 1 && <button aria-label={text('حذف اللاعب من الطلب', 'Remove child')} type="button" onClick={() => setChildren(list => list.filter((_, i) => index !== i))}><Trash2 className="h-4 w-4 text-red-600" /></button>}</div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label={text('اسم اللاعب', 'Child name')}><input aria-label={text('اسم اللاعب', 'Child name')} className={inputCls} minLength={2} required value={child.fullName} onChange={e => updateChild(index, { fullName: e.target.value })} /></FormField>
          <FormField label={text('الرقم الشخصي للاعب', 'Child national ID')}><input aria-label={text('الرقم الشخصي للاعب', 'Child national ID')} className={inputCls} required value={child.nationalId} onChange={e => updateChild(index, { nationalId: e.target.value })} /></FormField>
          <FormField label={text('تاريخ الميلاد', 'Birth date')}><input aria-label={text('تاريخ الميلاد', 'Birth date')} className={inputCls} type="date" max={new Date().toISOString().slice(0, 10)} required value={child.birthDate} onChange={e => updateChild(index, { birthDate: e.target.value })} /></FormField>
          <FormField label={text('فصيلة الدم', 'Blood type')}><select aria-label={text('فصيلة الدم', 'Blood type')} className={inputCls} value={child.bloodType} onChange={e => updateChild(index, { bloodType: e.target.value })}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(b => <option key={b}>{b}</option>)}</select></FormField>
          <FormField label={text('صورة اللاعب (حتى 5 ميجابايت)', 'Profile photo (up to 5 MB)')}><input aria-label={text('صورة اللاعب', 'Profile photo')} type="file" accept="image/jpeg,image/png,image/webp" required={!child.hasPhoto && !child.photo} onChange={e => updateChild(index, { photo: e.target.files?.[0] })} className={`${inputCls} max-w-full`} />{child.hasPhoto && <p className="text-xs text-emerald-600 mt-1">{text('الصورة محفوظة؛ يمكنك اختيار صورة بديلة.', 'Photo saved; you can choose a replacement.')}</p>}</FormField>
          <FormField label={text('ملاحظات صحية أو إدارية', 'Health or other notes')}><textarea className={inputCls} value={child.notes} onChange={e => updateChild(index, { notes: e.target.value })} /></FormField>
        </div>
      </section>)}
      {!appId && <button type="button" className="flex gap-2 text-emerald-700 font-bold" onClick={() => setChildren([...children, blankChild()])}><Plus className="h-5 w-5" />{text('إضافة ابن آخر', 'Add another child')}</button>}
      <button type="submit" className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-3 text-white font-bold">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{text('حفظ وإرسال للمراجعة', 'Save and submit for review')}</button>
    </fieldset>
  </form>;
}
