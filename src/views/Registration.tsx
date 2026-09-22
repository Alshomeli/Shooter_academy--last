import { useState, useEffect, useCallback, type FormEvent } from 'react';
import {
  ClipboardList, User, Users, Camera, FileCheck, CheckCircle2,
  ChevronLeft, ChevronRight, Plus, Trash2, Upload, Loader2,
  AlertCircle, FileText, Image as ImageIcon, Info,
} from 'lucide-react';
import type {
  Lang, RegistrationType, RegistrationChildInput,
  RegistrationParentInput, RegistrationApplication,
} from '@/types';
import { tr } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import {
  createDraft, uploadChildPhoto, registerDocument,
  submitApplication, fetchMyApplications,
} from '@/lib/registration';
import { compressImage, formatBytes } from '@/lib/image-compress';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

interface Props { lang: Lang; }

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const STEP_ICONS = [ClipboardList, User, Users, Camera, FileCheck, CheckCircle2];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const DOC_TYPES = [
  'parent_cpr', 'player_cpr', 'passport',
  'birth_certificate', 'medical_report', 'other',
] as const;

const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 text-sm py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white';

const maskCpr = (v: string) => v.length > 4 ? '***' + v.slice(-4) : v;

/* ------------------------------------------------------------------ */
/*  Child photo state per child                                        */
/* ------------------------------------------------------------------ */

interface ChildPhoto {
  file: File;
  preview: string;
  compressed?: Blob;
  originalSize: number;
  compressedSize?: number;
  reductionPercent?: number;
  uploading: boolean;
  uploaded: boolean;
  storagePath?: string;
  error?: string;
}

interface ExtraDoc {
  id: string;
  childId: string;
  docType: string;
  file: File;
  uploading: boolean;
  uploaded: boolean;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Registration({ lang }: Props) {
  const t = tr(lang);
  const isAr = lang === 'ar';

  const [step, setStep] = useState<Step>(0);
  const [loading, setLoading] = useState(true);
  const [existingApp, setExistingApp] = useState<RegistrationApplication | null>(null);
  const [userEmail, setUserEmail] = useState('');

  // Step 0
  const [regType, setRegType] = useState<RegistrationType | ''>('');

  // Step 1 - Parent
  const [parent, setParent] = useState<RegistrationParentInput>({
    registrationType: 'new_application',
    fullName: '', nationalId: '', phone: '', email: '',
    whatsapp: '', nationality: '', occupation: '',
    workplace: '', address: '', notes: '',
  });

  // Step 2 - Children
  const [children, setChildren] = useState<(RegistrationChildInput & { _key: string })[]>([
    { clientKey: crypto.randomUUID(), _key: crypto.randomUUID(), fullName: '', nationalId: '', birthDate: '', bloodType: '', notes: '' },
  ]);

  // Step 3 - Photos/docs
  const [childPhotos, setChildPhotos] = useState<Record<string, ChildPhoto>>({});
  const [extraDocs, setExtraDocs] = useState<ExtraDoc[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [childIdMap, setChildIdMap] = useState<Record<string, string>>({});
  const [draftCreating, setDraftCreating] = useState(false);
  const [draftError, setDraftError] = useState('');

  // Step 4 - Review
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step 5 - Success
  const [applicationRef, setApplicationRef] = useState('');

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  /* ---- Init ---- */
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.email) setUserEmail(user.email);
        const apps = await fetchMyApplications();
        const active = apps.find((a) =>
          a.status !== 'rejected' && a.status !== 'approved'
        );
        if (active) setExistingApp(active);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  /* ---- Step labels ---- */
  const stepLabels = [
    t.regStepType, t.regStepParent, t.regStepChildren,
    t.regStepDocuments, t.regStepReview, t.regStepSuccess,
  ];

  /* ---- Validation ---- */
  const validateParent = useCallback((): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!parent.fullName.trim()) e.fullName = t.regFieldRequired;
    if (!parent.nationalId.trim()) e.nationalId = t.regFieldRequired;
    if (!parent.phone.trim()) e.phone = t.regFieldRequired;
    if (!parent.email.trim()) e.email = t.regFieldRequired;
    else if (userEmail && parent.email.toLowerCase() !== userEmail.toLowerCase())
      e.email = t.regEmailMismatch;
    return e;
  }, [parent, userEmail, t]);

  const validateChildren = useCallback((): Record<string, string> => {
    const e: Record<string, string> = {};
    if (children.length === 0) { e._children = t.regChildRequired; return e; }
    children.forEach((c, i) => {
      if (!c.fullName.trim()) e[`child_${i}_name`] = t.regFieldRequired;
      if (!c.nationalId.trim()) e[`child_${i}_cpr`] = t.regFieldRequired;
      if (!c.birthDate) e[`child_${i}_birth`] = t.regFieldRequired;
    });
    return e;
  }, [children, t]);

  /* ---- Navigation ---- */
  const canGoNext = (): boolean => {
    if (step === 0) return !!regType;
    if (step === 1) return Object.keys(validateParent()).length === 0;
    if (step === 2) return Object.keys(validateChildren()).length === 0;
    if (step === 3) {
      return children.every((c) => {
        const photo = childPhotos[c._key];
        return photo?.uploaded;
      });
    }
    if (step === 4) return confirmed && !submitting;
    return false;
  };

  const goNext = async () => {
    if (step === 0 && regType) {
      setParent((p) => ({ ...p, registrationType: regType, email: userEmail || p.email }));
      setStep(1);
    } else if (step === 1) {
      const e = validateParent();
      setErrors(e);
      if (Object.keys(e).length > 0) return;
      setStep(2);
    } else if (step === 2) {
      const e = validateChildren();
      setErrors(e);
      if (Object.keys(e).length > 0) return;
      // Create draft
      if (!draftId) {
        setDraftCreating(true);
        setDraftError('');
        try {
          const result = await createDraft(
            { ...parent, registrationType: regType as RegistrationType },
            children.map((c) => ({
              clientKey: c.clientKey,
              fullName: c.fullName,
              nationalId: c.nationalId,
              birthDate: c.birthDate,
              bloodType: c.bloodType,
              notes: c.notes,
            })),
          );
          setDraftId(result.applicationId);
          const map: Record<string, string> = {};
          for (const ch of result.children) {
            const match = children.find((c) => c.clientKey === ch.clientKey);
            if (match) map[match._key] = ch.childId;
          }
          setChildIdMap(map);
        } catch (err) {
          setDraftError(err instanceof Error ? err.message : String(err));
          setDraftCreating(false);
          return;
        }
        setDraftCreating(false);
      }
      setStep(3);
    } else if (step === 3) {
      setStep(4);
    } else if (step === 4) {
      await handleSubmit();
    }
  };

  const goBack = () => {
    if (step > 0 && step < 5) setStep((s) => (s - 1) as Step);
    setErrors({});
  };

  /* ---- Submit ---- */
  const handleSubmit = async () => {
    if (!draftId || submitting) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await submitApplication(draftId);
      setApplicationRef(draftId.slice(0, 8).toUpperCase());
      setStep(5);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    }
    setSubmitting(false);
  };

  /* ---- Photo handling ---- */
  const handlePhotoSelect = async (childKey: string, file: File) => {
    if (!file.type.startsWith('image/')) return;
    const preview = URL.createObjectURL(file);
    setChildPhotos((prev) => ({
      ...prev,
      [childKey]: { file, preview, originalSize: file.size, uploading: false, uploaded: false },
    }));

    try {
      const result = await compressImage(file);
      setChildPhotos((prev) => ({
        ...prev,
        [childKey]: {
          ...prev[childKey],
          compressed: result.blob,
          compressedSize: result.compressedSize,
          reductionPercent: result.reductionPercent,
        },
      }));
    } catch {
      /* keep original preview */
    }
  };

  const uploadPhoto = async (childKey: string) => {
    const photo = childPhotos[childKey];
    if (!photo || photo.uploaded || photo.uploading || !draftId) return;
    const childId = childIdMap[childKey];
    if (!childId) return;

    setChildPhotos((prev) => ({
      ...prev,
      [childKey]: { ...prev[childKey], uploading: true, error: undefined },
    }));

    try {
      const blob = photo.compressed || photo.file;
      const mime = photo.compressed ? 'image/webp' : photo.file.type;
      const path = await uploadChildPhoto(draftId, childId, blob, mime);
      await registerDocument(draftId, childId, path, photo.file.name, mime, blob.size, 'photo');
      setChildPhotos((prev) => ({
        ...prev,
        [childKey]: { ...prev[childKey], uploading: false, uploaded: true, storagePath: path },
      }));
    } catch (err) {
      setChildPhotos((prev) => ({
        ...prev,
        [childKey]: { ...prev[childKey], uploading: false, error: t.regUploadFailed },
      }));
    }
  };

  // Auto-upload when photo is compressed and draft exists
  useEffect(() => {
    if (!draftId) return;
    for (const key of Object.keys(childPhotos)) {
      const p = childPhotos[key];
      if (p && !p.uploaded && !p.uploading && !p.error && (p.compressed || p.file)) {
        uploadPhoto(key);
      }
    }
  }, [draftId, childPhotos, childIdMap]);

  /* ---- Extra document handling ---- */
  const handleDocSelect = (childKey: string, docType: string, file: File) => {
    setExtraDocs((prev) => [
      ...prev,
      { id: crypto.randomUUID(), childId: childKey, docType, file, uploading: false, uploaded: false },
    ]);
  };

  const uploadExtraDoc = async (docId: string) => {
    const idx = extraDocs.findIndex((d) => d.id === docId);
    if (idx < 0 || !draftId) return;
    const doc = extraDocs[idx];
    if (doc.uploaded || doc.uploading) return;
    const childId = childIdMap[doc.childId];
    if (!childId) return;

    setExtraDocs((prev) => prev.map((d) => d.id === docId ? { ...d, uploading: true, error: undefined } : d));

    try {
      const ext = doc.file.name.split('.').pop() || 'bin';
      const path = `applications/${draftId}/${childId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('player-documents')
        .upload(path, doc.file, { contentType: doc.file.type, upsert: false });
      if (upErr) throw upErr;
      await registerDocument(draftId, childId, path, doc.file.name, doc.file.type, doc.file.size, 'document', doc.docType);
      setExtraDocs((prev) => prev.map((d) => d.id === docId ? { ...d, uploading: false, uploaded: true } : d));
    } catch {
      setExtraDocs((prev) => prev.map((d) => d.id === docId ? { ...d, uploading: false, error: t.regUploadFailed } : d));
    }
  };

  useEffect(() => {
    if (!draftId) return;
    for (const doc of extraDocs) {
      if (!doc.uploaded && !doc.uploading && !doc.error) uploadExtraDoc(doc.id);
    }
  }, [draftId, extraDocs]);

  /* ---- Children management ---- */
  const addChild = () => {
    setChildren((prev) => [
      ...prev,
      { clientKey: crypto.randomUUID(), _key: crypto.randomUUID(), fullName: '', nationalId: '', birthDate: '', bloodType: '', notes: '' },
    ]);
  };

  const removeChild = (key: string) => {
    if (children.length <= 1) return;
    setChildren((prev) => prev.filter((c) => c._key !== key));
    setChildPhotos((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const updateChild = (key: string, field: string, value: string) => {
    setChildren((prev) => prev.map((c) => c._key === key ? { ...c, [field]: value } : c));
  };

  /* ---- Doc type labels ---- */
  const docTypeLabel = (dt: string): string => {
    const map: Record<string, string> = {
      parent_cpr: t.regDocParentCpr, player_cpr: t.regDocPlayerCpr,
      passport: t.regDocPassport, birth_certificate: t.regDocBirthCert,
      medical_report: t.regDocMedical, other: t.regDocOther,
    };
    return map[dt] || dt;
  };

  /* ================================================================== */
  /*  Render                                                            */
  /* ================================================================== */

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32" dir={isAr ? 'rtl' : 'ltr'}>
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    );
  }

  /* ---- Existing application status ---- */
  if (existingApp) {
    return <ExistingAppStatus app={existingApp} lang={lang} />;
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto" dir={isAr ? 'rtl' : 'ltr'}>
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-black text-slate-900 dark:text-white">{t.registrationWizard}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {isAr ? 'أكاديمية شوتر لكرة القدم' : 'Shooter Football Academy'}
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center gap-1 px-2">
        {stepLabels.map((label, i) => {
          const Icon = STEP_ICONS[i];
          const done = i < step;
          const active = i === step;
          return (
            <div key={i} className="flex items-center gap-1">
              {i > 0 && <div className={`w-4 sm:w-8 h-0.5 rounded ${done ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />}
              <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] sm:text-xs font-bold whitespace-nowrap transition ${
                active ? 'bg-emerald-600 text-white shadow' :
                done ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' :
                'bg-slate-100 dark:bg-slate-800 text-slate-400'
              }`}>
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">{label}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 sm:p-6 shadow-sm">

        {/* ======== STEP 0: Registration Type ======== */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-slate-900 dark:text-white">{t.regStepType}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <TypeCard
                selected={regType === 'initial_onboarding'}
                onClick={() => setRegType('initial_onboarding')}
                title={t.regTypeOnboarding}
                description={t.regTypeOnboardingDesc}
                icon={<Users className="h-6 w-6" />}
                color="blue"
              />
              <TypeCard
                selected={regType === 'new_application'}
                onClick={() => setRegType('new_application')}
                title={t.regTypeNew}
                description={t.regTypeNewDesc}
                icon={<Plus className="h-6 w-6" />}
                color="emerald"
              />
            </div>
          </div>
        )}

        {/* ======== STEP 1: Parent Info ======== */}
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-base font-black text-slate-900 dark:text-white">{t.regStepParent}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label={t.regFullName} required error={errors.fullName}>
                <input value={parent.fullName} onChange={(e) => setParent((p) => ({ ...p, fullName: e.target.value }))} className={inputCls} />
              </Field>
              <Field label={t.regCpr} required error={errors.nationalId}>
                <input value={parent.nationalId} onChange={(e) => setParent((p) => ({ ...p, nationalId: e.target.value }))} className={inputCls} dir="ltr" />
              </Field>
              <Field label={t.regPhone} required error={errors.phone}>
                <input value={parent.phone} onChange={(e) => setParent((p) => ({ ...p, phone: e.target.value }))} className={inputCls} dir="ltr" type="tel" />
              </Field>
              <Field label={t.regEmail} required error={errors.email}>
                <input value={parent.email} onChange={(e) => setParent((p) => ({ ...p, email: e.target.value }))} className={inputCls} dir="ltr" type="email" />
              </Field>
              <Field label={t.regWhatsapp}>
                <input value={parent.whatsapp} onChange={(e) => setParent((p) => ({ ...p, whatsapp: e.target.value }))} className={inputCls} dir="ltr" type="tel" />
              </Field>
              <Field label={t.regNationality}>
                <input value={parent.nationality} onChange={(e) => setParent((p) => ({ ...p, nationality: e.target.value }))} className={inputCls} />
              </Field>
              <Field label={t.regOccupation}>
                <input value={parent.occupation} onChange={(e) => setParent((p) => ({ ...p, occupation: e.target.value }))} className={inputCls} />
              </Field>
              <Field label={t.regWorkplace}>
                <input value={parent.workplace} onChange={(e) => setParent((p) => ({ ...p, workplace: e.target.value }))} className={inputCls} />
              </Field>
              <div className="sm:col-span-2">
                <Field label={t.regAddress}>
                  <input value={parent.address} onChange={(e) => setParent((p) => ({ ...p, address: e.target.value }))} className={inputCls} />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label={t.regNotes}>
                  <textarea value={parent.notes} onChange={(e) => setParent((p) => ({ ...p, notes: e.target.value }))} className={`${inputCls} min-h-16`} rows={2} />
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ======== STEP 2: Children ======== */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-slate-900 dark:text-white">{t.regStepChildren}</h2>
              {!draftId && (
                <button onClick={addChild} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition cursor-pointer">
                  {t.regAddChild}
                </button>
              )}
            </div>
            {errors._children && <p className="text-xs text-red-500 font-bold">{errors._children}</p>}
            {children.map((child, idx) => (
              <div key={child._key} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                    {isAr ? `اللاعب ${idx + 1}` : `Player ${idx + 1}`}
                  </span>
                  {children.length > 1 && !draftId && (
                    <button onClick={() => removeChild(child._key)} className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-400 cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" /> {t.regRemoveChild}
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label={t.regChildName} required error={errors[`child_${idx}_name`]}>
                    <input value={child.fullName} onChange={(e) => updateChild(child._key, 'fullName', e.target.value)} className={inputCls} />
                  </Field>
                  <Field label={t.regChildCpr} required error={errors[`child_${idx}_cpr`]}>
                    <input value={child.nationalId} onChange={(e) => updateChild(child._key, 'nationalId', e.target.value)} className={inputCls} dir="ltr" />
                  </Field>
                  <Field label={t.regChildBirthDate} required error={errors[`child_${idx}_birth`]}>
                    <input type="date" value={child.birthDate} onChange={(e) => updateChild(child._key, 'birthDate', e.target.value)} className={inputCls} dir="ltr" />
                  </Field>
                  <Field label={t.regChildBloodType}>
                    <select value={child.bloodType} onChange={(e) => updateChild(child._key, 'bloodType', e.target.value)} className={inputCls}>
                      <option value="">—</option>
                      {BLOOD_TYPES.map((bt) => <option key={bt} value={bt}>{bt}</option>)}
                    </select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label={t.regChildNotes}>
                      <textarea value={child.notes} onChange={(e) => updateChild(child._key, 'notes', e.target.value)} className={`${inputCls} min-h-12`} rows={1} />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ======== STEP 3: Photos & Documents ======== */}
        {step === 3 && (
          <div className="space-y-5">
            <h2 className="text-base font-black text-slate-900 dark:text-white">{t.regStepDocuments}</h2>
            {draftCreating && (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {t.regSubmitting}</div>
            )}
            {draftError && <p className="text-xs text-red-500 font-bold">{draftError}</p>}

            {children.map((child, idx) => {
              const photo = childPhotos[child._key];
              const childDocs = extraDocs.filter((d) => d.childId === child._key);
              return (
                <div key={child._key} className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                  <span className="text-sm font-black text-slate-700 dark:text-slate-200">
                    {child.fullName || (isAr ? `اللاعب ${idx + 1}` : `Player ${idx + 1}`)}
                  </span>

                  {/* Profile photo */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                      <Camera className="h-3.5 w-3.5" /> {t.regChildPhoto} <span className="text-red-500">*</span>
                    </label>
                    {photo?.preview ? (
                      <div className="flex items-start gap-3">
                        <img src={photo.preview} alt="" className="w-20 h-20 rounded-xl object-cover border border-slate-200 dark:border-slate-700" />
                        <div className="text-xs space-y-1">
                          <p className="text-slate-500">{t.regOriginalSize}: <span className="font-bold text-slate-700 dark:text-slate-300">{formatBytes(photo.originalSize)}</span></p>
                          {photo.compressedSize != null && (
                            <>
                              <p className="text-slate-500">{t.regCompressedSize}: <span className="font-bold text-emerald-600">{formatBytes(photo.compressedSize)}</span></p>
                              <p className="text-emerald-600 font-bold">{t.regSaving}: {photo.reductionPercent}%</p>
                            </>
                          )}
                          {photo.uploading && <p className="text-blue-500 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {isAr ? 'جاري الرفع...' : 'Uploading...'}</p>}
                          {photo.uploaded && <p className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {isAr ? 'تم الرفع' : 'Uploaded'}</p>}
                          {photo.error && (
                            <div>
                              <p className="text-red-500">{photo.error}</p>
                              <button onClick={() => uploadPhoto(child._key)} className="text-blue-500 hover:underline cursor-pointer">{isAr ? 'إعادة المحاولة' : 'Retry'}</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-emerald-400 transition cursor-pointer">
                        <ImageIcon className="h-8 w-8 text-slate-400 mb-2" />
                        <span className="text-xs font-bold text-slate-500">{t.regUploadPhoto}</span>
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePhotoSelect(child._key, e.target.files[0]); }} />
                      </label>
                    )}
                  </div>

                  {/* Extra documents */}
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                      <FileText className="h-3.5 w-3.5" /> {t.regUploadDocument}
                    </label>
                    {childDocs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 text-xs py-1">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <span className="text-slate-700 dark:text-slate-300">{docTypeLabel(doc.docType)}: {doc.file.name}</span>
                        {doc.uploading && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                        {doc.uploaded && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                        {doc.error && <span className="text-red-500">{doc.error}</span>}
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <select id={`doc-type-${child._key}`} className={`${inputCls} max-w-40 text-xs`} defaultValue="player_cpr">
                        {DOC_TYPES.map((dt) => <option key={dt} value={dt}>{docTypeLabel(dt)}</option>)}
                      </select>
                      <label className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 cursor-pointer">
                        <Upload className="h-3.5 w-3.5" /> {t.regUploadDocument}
                        <input type="file" className="hidden" onChange={(e) => {
                          const sel = document.getElementById(`doc-type-${child._key}`) as HTMLSelectElement;
                          if (e.target.files?.[0]) handleDocSelect(child._key, sel.value, e.target.files[0]);
                          e.target.value = '';
                        }} />
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ======== STEP 4: Review ======== */}
        {step === 4 && (
          <div className="space-y-5">
            <h2 className="text-base font-black text-slate-900 dark:text-white">{t.regStepReview}</h2>

            {/* Reg type */}
            <ReviewSection title={t.regStepType}>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {regType === 'initial_onboarding' ? t.regTypeOnboardingShort : t.regTypeNewShort}
              </p>
            </ReviewSection>

            {/* Parent */}
            <ReviewSection title={t.regParentInfo}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Dt label={t.regFullName} value={parent.fullName} />
                <Dt label={t.regCpr} value={maskCpr(parent.nationalId)} />
                <Dt label={t.regPhone} value={parent.phone} />
                <Dt label={t.regEmail} value={parent.email} />
                {parent.whatsapp && <Dt label={t.regWhatsapp} value={parent.whatsapp} />}
                {parent.nationality && <Dt label={t.regNationality} value={parent.nationality} />}
                {parent.occupation && <Dt label={t.regOccupation} value={parent.occupation} />}
                {parent.workplace && <Dt label={t.regWorkplace} value={parent.workplace} />}
                {parent.address && <Dt label={t.regAddress} value={parent.address} />}
              </dl>
            </ReviewSection>

            {/* Children */}
            <ReviewSection title={t.regChildrenInfo}>
              {children.map((child, idx) => {
                const photo = childPhotos[child._key];
                return (
                  <div key={child._key} className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    {photo?.preview && <img src={photo.preview} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" />}
                    <div className="text-sm">
                      <p className="font-bold text-slate-800 dark:text-white">{child.fullName}</p>
                      <p className="text-xs text-slate-500">{t.regChildCpr}: {maskCpr(child.nationalId)} · {t.regChildBirthDate}: {child.birthDate}</p>
                      {child.bloodType && <p className="text-xs text-slate-400">{t.regChildBloodType}: {child.bloodType}</p>}
                    </div>
                  </div>
                );
              })}
            </ReviewSection>

            {/* Documents */}
            {extraDocs.length > 0 && (
              <ReviewSection title={t.regDocuments}>
                {extraDocs.filter((d) => d.uploaded).map((doc) => (
                  <p key={doc.id} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5 py-0.5">
                    <FileText className="h-3 w-3" /> {docTypeLabel(doc.docType)} — {doc.file.name}
                  </p>
                ))}
              </ReviewSection>
            )}

            {/* Confirmation */}
            <label className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 cursor-pointer">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 accent-emerald-600" />
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{t.regConfirmCheckbox}</span>
            </label>

            {submitError && <p className="text-xs text-red-500 font-bold flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {submitError}</p>}
          </div>
        )}

        {/* ======== STEP 5: Success ======== */}
        {step === 5 && (
          <div className="text-center py-8 space-y-4">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">{t.regSuccessTitle}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">{t.regSuccessMessage}</p>
            <div className="inline-block px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-sm font-bold text-slate-700 dark:text-slate-300">
              {t.regReference}: <span className="font-black text-emerald-600">{applicationRef}</span>
            </div>
          </div>
        )}

        {/* ======== Navigation buttons ======== */}
        {step < 5 && (
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
            {step > 0 ? (
              <button onClick={goBack} className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer">
                {isAr ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                {t.regBack}
              </button>
            ) : <div />}
            <button
              onClick={goNext}
              disabled={!canGoNext() || draftCreating || submitting}
              className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-500 shadow-sm transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {(draftCreating || submitting) && <Loader2 className="h-4 w-4 animate-spin" />}
              {step === 4 ? t.regSubmit : t.regNext}
              {step < 4 && !isAr && <ChevronRight className="h-4 w-4" />}
              {step < 4 && isAr && <ChevronLeft className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function TypeCard({ selected, onClick, title, description, icon, color }: {
  selected: boolean; onClick: () => void; title: string;
  description: string; icon: React.ReactNode; color: 'blue' | 'emerald';
}) {
  const ring = selected
    ? `border-${color}-500 ring-2 ring-${color}-500/30 bg-${color}-50 dark:bg-${color}-900/10`
    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600';
  return (
    <button onClick={onClick} className={`p-5 rounded-xl border text-right transition cursor-pointer ${ring}`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${
        selected
          ? `bg-${color}-100 dark:bg-${color}-900/30 text-${color}-600`
          : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
      }`}>{icon}</div>
      <h3 className={`text-sm font-black mb-1 ${selected ? `text-${color}-700 dark:text-${color}-400` : 'text-slate-800 dark:text-white'}`}>{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
    </button>
  );
}

function Field({ label, required, error, children: ch }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {ch}
      {error && <p className="text-[11px] text-red-500 font-bold mt-1">{error}</p>}
    </div>
  );
}

function ReviewSection({ title, children: ch }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2">
      <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">{title}</h3>
      {ch}
    </div>
  );
}

function Dt({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-slate-400">{label}</dt>
      <dd className="text-sm font-bold text-slate-800 dark:text-white">{value}</dd>
    </div>
  );
}

function ExistingAppStatus({ app, lang }: { app: RegistrationApplication; lang: Lang }) {
  const t = tr(lang);
  const isAr = lang === 'ar';
  const statusMap: Record<string, { label: string; color: string }> = {
    draft: { label: t.regStatusDraft, color: 'slate' },
    pending: { label: t.regStatusPending, color: 'amber' },
    under_review: { label: t.regStatusUnderReview, color: 'blue' },
    needs_info: { label: t.regStatusNeedsInfo, color: 'orange' },
    approved: { label: t.regStatusApproved, color: 'emerald' },
    rejected: { label: t.regStatusRejected, color: 'red' },
  };
  const s = statusMap[app.status] || statusMap.draft;

  return (
    <div className="max-w-lg mx-auto space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      <div className="text-center">
        <h1 className="text-xl font-black text-slate-900 dark:text-white">{t.registrationWizard}</h1>
      </div>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm text-center space-y-4">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
          <Info className="h-7 w-7" />
        </div>
        <h2 className="text-base font-black text-slate-900 dark:text-white">{t.regExistingApp}</h2>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-${s.color}-100 dark:bg-${s.color}-900/30 text-${s.color}-700 dark:text-${s.color}-400`}>
          {s.label}
        </div>
        <p className="text-xs text-slate-500">{t.regReference}: <span className="font-black">{app.id.slice(0, 8).toUpperCase()}</span></p>
        {app.reviewNotes && (
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-400 text-right">
            <span className="font-bold">{t.regReviewNotes}:</span> {app.reviewNotes}
          </div>
        )}
      </div>
    </div>
  );
}
