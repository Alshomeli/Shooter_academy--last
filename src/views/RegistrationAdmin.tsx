import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ClipboardList, Search, Eye, Clock, CheckCircle2, XCircle,
  AlertTriangle, ChevronRight, ChevronLeft, Loader2, Users,
  FileText, Camera, User, Shield, Trophy, Info,
} from 'lucide-react';
import type { Lang, Role, Team, RegistrationApplication, RegistrationStatus } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, StatCard } from '@/components/ui';
import { tr } from '@/lib/i18n';
import {
  fetchAllApplications, reviewApplication, approveApplication,
  finalizePlayer, getSignedUrl,
} from '@/lib/registration';

interface Props {
  lang: Lang;
  activeRole: Role;
  teams: Team[];
}

const STATUS_CONFIGS: Record<RegistrationStatus, { color: string; icon: typeof Clock }> = {
  draft: { color: 'slate', icon: FileText },
  pending: { color: 'amber', icon: Clock },
  under_review: { color: 'blue', icon: Eye },
  needs_info: { color: 'orange', icon: AlertTriangle },
  approved: { color: 'emerald', icon: CheckCircle2 },
  rejected: { color: 'red', icon: XCircle },
};

const maskCpr = (v?: string) => v && v.length > 4 ? '***' + v.slice(-4) : v || '—';

export function RegistrationAdmin({ lang, activeRole, teams }: Props) {
  const t = tr(lang);
  const isAr = lang === 'ar';

  const [apps, setApps] = useState<RegistrationApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedApp, setSelectedApp] = useState<RegistrationApplication | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; id: string } | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');

  // Assignment state
  const [assignData, setAssignData] = useState<Record<string, { teamId: string; position: string; jerseyNumber: number }>>({});

  // Photo URLs
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  const loadApps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllApplications();
      setApps(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadApps(); }, [loadApps]);

  // Load photo URLs for selected app
  useEffect(() => {
    if (!selectedApp) return;
    const photoDocs = selectedApp.documents.filter((d) => d.fileCategory === 'photo');
    for (const doc of photoDocs) {
      if (photoUrls[doc.storagePath]) continue;
      getSignedUrl(doc.storagePath).then((url) => {
        if (url) setPhotoUrls((prev) => ({ ...prev, [doc.storagePath]: url }));
      });
    }
  }, [selectedApp]);

  const statusLabel = (status: RegistrationStatus): string => {
    const map: Record<string, string> = {
      draft: t.regStatusDraft, pending: t.regStatusPending,
      under_review: t.regStatusUnderReview, needs_info: t.regStatusNeedsInfo,
      approved: t.regStatusApproved, rejected: t.regStatusRejected,
    };
    return map[status] || status;
  };

  const regTypeLabel = (rt: string): string =>
    rt === 'initial_onboarding' ? t.regTypeOnboardingShort : t.regTypeNewShort;

  /* ---- Counts ---- */
  const counts = useMemo(() => {
    const c: Record<string, number> = { pending: 0, under_review: 0, needs_info: 0, approved: 0, rejected: 0 };
    for (const a of apps) c[a.status] = (c[a.status] || 0) + 1;
    return c;
  }, [apps]);

  /* ---- Filtered ---- */
  const filtered = useMemo(() => {
    return apps.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (typeFilter !== 'all' && a.registrationType !== typeFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!a.parentName.toLowerCase().includes(q) && !a.parentPhone.includes(q)) return false;
      }
      return true;
    });
  }, [apps, statusFilter, typeFilter, search]);

  /* ---- Actions ---- */
  const handleAction = async (type: string, appId: string) => {
    setActionLoading(true);
    try {
      if (type === 'under_review') {
        await reviewApplication(appId, 'under_review', reviewNotes);
      } else if (type === 'needs_info') {
        await reviewApplication(appId, 'needs_info', reviewNotes);
      } else if (type === 'rejected') {
        await reviewApplication(appId, 'rejected', reviewNotes);
      } else if (type === 'approved') {
        await approveApplication(appId);
      }
      await loadApps();
      if (selectedApp?.id === appId) {
        const updated = (await fetchAllApplications()).find((a) => a.id === appId);
        setSelectedApp(updated || null);
      }
      setReviewNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setActionLoading(false);
    setConfirmAction(null);
  };

  const handleFinalize = async (playerId: string) => {
    const data = assignData[playerId];
    if (!data?.teamId || !data?.position) return;
    setActionLoading(true);
    try {
      await finalizePlayer(playerId, data.teamId, data.position, data.jerseyNumber || 0);
      await loadApps();
      if (selectedApp) {
        const updated = (await fetchAllApplications()).find((a) => a.id === selectedApp.id);
        setSelectedApp(updated || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setActionLoading(false);
  };

  const setAssign = (playerId: string, field: string, value: string | number) => {
    setAssignData((prev) => ({
      ...prev,
      [playerId]: { ...prev[playerId], [field]: value } as typeof prev[string],
    }));
  };

  /* ---- Guard ---- */
  if (activeRole !== 'manager') {
    return (
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <PageHeader title={t.registrationAdmin} subtitle="" />
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-10 text-center">
          <Info className="h-8 w-8 text-red-500 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{t.insufficientPermissions}</p>
        </div>
      </div>
    );
  }

  const inputCls = 'w-full bg-slate-50 dark:bg-slate-800 text-sm py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white';

  return (
    <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t.registrationAdmin}
        subtitle={isAr ? `${apps.length} طلب تسجيل` : `${apps.length} registration requests`}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard icon={<Clock className="h-5 w-5" />} label={t.regStatusPending} value={counts.pending} color="amber" />
        <StatCard icon={<Eye className="h-5 w-5" />} label={t.regStatusUnderReview} value={counts.under_review} color="blue" />
        <StatCard icon={<AlertTriangle className="h-5 w-5" />} label={t.regStatusNeedsInfo} value={counts.needs_info} color="amber" />
        <StatCard icon={<CheckCircle2 className="h-5 w-5" />} label={t.regStatusApproved} value={counts.approved} color="emerald" />
        <StatCard icon={<XCircle className="h-5 w-5" />} label={t.regStatusRejected} value={counts.rejected} color="red" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={isAr ? 'بحث بالاسم أو الهاتف...' : 'Search by name or phone...'}
            className={`${inputCls} pr-10`}
          />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${inputCls} max-w-40`}>
          <option value="all">{t.regFilterAll}</option>
          <option value="pending">{t.regStatusPending}</option>
          <option value="under_review">{t.regStatusUnderReview}</option>
          <option value="needs_info">{t.regStatusNeedsInfo}</option>
          <option value="approved">{t.regStatusApproved}</option>
          <option value="rejected">{t.regStatusRejected}</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={`${inputCls} max-w-48`}>
          <option value="all">{t.regFilterAll}</option>
          <option value="initial_onboarding">{t.regTypeOnboardingShort}</option>
          <option value="new_application">{t.regTypeNewShort}</option>
        </select>
      </div>

      {error && <p className="text-xs text-red-500 font-bold">{error}</p>}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-emerald-500" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-8 w-8" />} title={t.regNoApplications} />
      ) : (
        <div className="space-y-2.5">
          {filtered.map((app) => {
            const cfg = STATUS_CONFIGS[app.status];
            const StatusIcon = cfg.icon;
            return (
              <button
                key={app.id}
                onClick={() => setSelectedApp(app)}
                className="w-full bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:shadow-md transition-shadow cursor-pointer text-right"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-${cfg.color}-100 dark:bg-${cfg.color}-900/30 text-${cfg.color}-600 dark:text-${cfg.color}-400`}>
                    <StatusIcon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-black text-slate-900 dark:text-white truncate">{app.parentName}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Badge color={cfg.color as 'emerald'}>{statusLabel(app.status)}</Badge>
                      <span className="text-[11px] text-slate-400">{regTypeLabel(app.registrationType)}</span>
                      <span className="text-[11px] text-slate-400">· {app.children.length} {isAr ? 'لاعب' : 'player(s)'}</span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-400 shrink-0" dir="ltr">
                    {app.createdAt.substring(0, 10)}
                  </div>
                  {isAr ? <ChevronLeft className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selectedApp && (
        <Modal open onClose={() => setSelectedApp(null)} title={t.regApplicationDetails} size="xl">
          <AppDetail
            app={selectedApp}
            lang={lang}
            teams={teams}
            photoUrls={photoUrls}
            assignData={assignData}
            actionLoading={actionLoading}
            reviewNotes={reviewNotes}
            setReviewNotes={setReviewNotes}
            onAction={(type) => {
              if (type === 'approved' || type === 'rejected') {
                setConfirmAction({ type, id: selectedApp.id });
              } else {
                handleAction(type, selectedApp.id);
              }
            }}
            onFinalize={handleFinalize}
            onAssignChange={setAssign}
          />
        </Modal>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={confirmAction?.type === 'approved'}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && handleAction('approved', confirmAction.id)}
        title={t.regApprove}
        message={t.regApproveConfirm}
        confirmLabel={t.regApprove}
      />
      <ConfirmDialog
        open={confirmAction?.type === 'rejected'}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => confirmAction && handleAction('rejected', confirmAction.id)}
        title={t.regReject}
        message={t.regRejectConfirm}
        confirmLabel={t.regReject}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Application detail                                                 */
/* ------------------------------------------------------------------ */

function AppDetail({
  app, lang, teams, photoUrls, assignData, actionLoading, reviewNotes, setReviewNotes,
  onAction, onFinalize, onAssignChange,
}: {
  app: RegistrationApplication;
  lang: Lang;
  teams: Team[];
  photoUrls: Record<string, string>;
  assignData: Record<string, { teamId: string; position: string; jerseyNumber: number }>;
  actionLoading: boolean;
  reviewNotes: string;
  setReviewNotes: (v: string) => void;
  onAction: (type: string) => void;
  onFinalize: (playerId: string) => void;
  onAssignChange: (playerId: string, field: string, value: string | number) => void;
}) {
  const t = tr(lang);
  const isAr = lang === 'ar';

  const inputCls = 'w-full bg-slate-50 dark:bg-slate-800 text-sm py-2 px-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white';

  const regTypeLabel = app.registrationType === 'initial_onboarding' ? t.regTypeOnboardingShort : t.regTypeNewShort;
  const cfg = STATUS_CONFIGS[app.status];

  const docTypeLabel = (dt?: string): string => {
    if (!dt) return '';
    const map: Record<string, string> = {
      parent_cpr: t.regDocParentCpr, player_cpr: t.regDocPlayerCpr,
      passport: t.regDocPassport, birth_certificate: t.regDocBirthCert,
      medical_report: t.regDocMedical, other: t.regDocOther,
    };
    return map[dt] || dt;
  };

  const positions = [
    { value: 'حارس مرمى', label: isAr ? 'حارس مرمى' : 'Goalkeeper' },
    { value: 'مدافع', label: isAr ? 'مدافع' : 'Defender' },
    { value: 'خط وسط', label: isAr ? 'خط وسط' : 'Midfielder' },
    { value: 'مهاجم', label: isAr ? 'مهاجم' : 'Forward' },
  ];

  return (
    <div className="space-y-5 max-h-[75vh] overflow-y-auto">
      {/* Status + type */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge color={cfg.color as 'emerald'}>{
          ({ draft: t.regStatusDraft, pending: t.regStatusPending, under_review: t.regStatusUnderReview, needs_info: t.regStatusNeedsInfo, approved: t.regStatusApproved, rejected: t.regStatusRejected })[app.status]
        }</Badge>
        <Badge color="blue">{regTypeLabel}</Badge>
        <span className="text-xs text-slate-400" dir="ltr">{app.createdAt.substring(0, 10)}</span>
      </div>

      {/* Parent info */}
      <Section title={t.regParentInfo} icon={<User className="h-4 w-4" />}>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Dt label={t.regFullName} value={app.parentName} />
          <Dt label={t.regCpr} value={maskCpr(app.parentNationalId)} />
          <Dt label={t.regPhone} value={app.parentPhone} />
          <Dt label={t.regEmail} value={app.parentEmail} />
          {app.parentWhatsapp && <Dt label={t.regWhatsapp} value={app.parentWhatsapp} />}
          {app.parentNationality && <Dt label={t.regNationality} value={app.parentNationality} />}
          {app.parentOccupation && <Dt label={t.regOccupation} value={app.parentOccupation} />}
          {app.parentWorkplace && <Dt label={t.regWorkplace} value={app.parentWorkplace} />}
          {app.parentAddress && <Dt label={t.regAddress} value={app.parentAddress} />}
        </dl>
      </Section>

      {/* Children */}
      <Section title={t.regChildrenInfo} icon={<Users className="h-4 w-4" />}>
        {app.children.map((child) => {
          const photoDoc = app.documents.find((d) => d.childId === child.id && d.fileCategory === 'photo');
          const photoUrl = photoDoc ? photoUrls[photoDoc.storagePath] : undefined;
          const childDocs = app.documents.filter((d) => d.childId === child.id && d.fileCategory === 'document');
          const assign = child.playerId ? assignData[child.playerId] : undefined;
          const selectedTeam = assign?.teamId ? teams.find((tm) => tm.id === assign.teamId) : undefined;

          return (
            <div key={child.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3 mb-3">
              <div className="flex items-start gap-3">
                {photoUrl ? (
                  <img src={photoUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <Camera className="h-6 w-6 text-slate-400" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{child.fullName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {t.regChildCpr}: {maskCpr(child.nationalId)} · {t.regChildBirthDate}: {child.birthDate}
                  </p>
                  {child.bloodType && <p className="text-xs text-slate-400">{t.regChildBloodType}: {child.bloodType}</p>}
                  {child.notes && <p className="text-xs text-slate-400 mt-1">{t.regNotes}: {child.notes}</p>}
                </div>
              </div>

              {/* Child documents */}
              {childDocs.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {childDocs.map((doc) => (
                    <span key={doc.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                      <FileText className="h-3 w-3" /> {docTypeLabel(doc.documentType)}
                    </span>
                  ))}
                </div>
              )}

              {/* Assignment UI for approved apps */}
              {app.status === 'approved' && child.playerId && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/30 space-y-3">
                  <h4 className="text-xs font-black text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5" /> {t.regAssignTeam}
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">{t.team}</label>
                      <select
                        value={assign?.teamId || ''}
                        onChange={(e) => onAssignChange(child.playerId!, 'teamId', e.target.value)}
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                      </select>
                      {selectedTeam && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{t.pitchNumber}: {selectedTeam.pitchNumber}</p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">{t.regAssignPosition}</label>
                      <select
                        value={assign?.position || ''}
                        onChange={(e) => onAssignChange(child.playerId!, 'position', e.target.value)}
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {positions.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-1">{t.regAssignJersey}</label>
                      <input
                        type="number" min={0}
                        value={assign?.jerseyNumber || ''}
                        onChange={(e) => onAssignChange(child.playerId!, 'jerseyNumber', Number(e.target.value) || 0)}
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => onFinalize(child.playerId!)}
                    disabled={actionLoading || !assign?.teamId || !assign?.position}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {actionLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shield className="h-3.5 w-3.5" />}
                    {t.regFinalize}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </Section>

      {/* Review notes */}
      {app.reviewNotes && (
        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-400">
          <span className="font-bold">{t.regReviewNotes}:</span> {app.reviewNotes}
        </div>
      )}

      {/* Action buttons */}
      {(app.status === 'pending' || app.status === 'under_review' || app.status === 'needs_info') && (
        <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div>
            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t.regReviewNotes}</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              className={`${inputCls} min-h-16`}
              rows={2}
              placeholder={isAr ? 'أضف ملاحظات المراجعة (اختياري)...' : 'Add review notes (optional)...'}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {app.status === 'pending' && (
              <ActionBtn onClick={() => onAction('under_review')} loading={actionLoading} color="blue" icon={<Eye className="h-3.5 w-3.5" />}>
                {t.regMarkUnderReview}
              </ActionBtn>
            )}
            {(app.status === 'pending' || app.status === 'under_review') && (
              <ActionBtn onClick={() => onAction('needs_info')} loading={actionLoading} color="amber" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
                {t.regRequestInfo}
              </ActionBtn>
            )}
            {(app.status === 'under_review' || app.status === 'needs_info') && (
              <ActionBtn onClick={() => onAction('approved')} loading={actionLoading} color="emerald" icon={<CheckCircle2 className="h-3.5 w-3.5" />}>
                {t.regApprove}
              </ActionBtn>
            )}
            <ActionBtn onClick={() => onAction('rejected')} loading={actionLoading} color="red" icon={<XCircle className="h-3.5 w-3.5" />}>
              {t.regReject}
            </ActionBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
        {icon} {title}
      </h3>
      {children}
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

function ActionBtn({ onClick, loading, color, icon, children }: {
  onClick: () => void; loading: boolean; color: string;
  icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-${color}-50 dark:bg-${color}-900/20 text-${color}-700 dark:text-${color}-400 hover:bg-${color}-100 dark:hover:bg-${color}-900/30`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  );
}
