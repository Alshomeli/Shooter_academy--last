import { useState, type FormEvent } from 'react';
import {
  CalendarDays, Dumbbell, Trophy, Plus, Edit2, Trash2, Clock, MapPin,
  Target, Users, FileText, Play, Flag,
} from 'lucide-react';
import type { Match, Training, Team, Player, Lang, Role } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, StatCard, SaveButton } from '@/components/ui';
import { tr } from '@/lib/i18n';

interface SchedulesProps {
  matches: Match[];
  trainings: Training[];
  teams: Team[];
  players: Player[];
  onMatchesChange: (m: Match[]) => void;
  onTrainingsChange: (t: Training[]) => void;
  activeRole: Role;
  lang: Lang;
}

type SubTab = 'matches' | 'trainings';
type MatchResult = Match['result'];
type TrainingForm = Omit<Training, 'id'>;

const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 text-sm py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white';

/* ---------- date / time helpers (Arabic-Saudi locale) ---------- */
function formatArabicDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatArabicTime(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('ar-SA', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/* ---------- result styling map ---------- */
const RESULT_STYLES: Record<
  MatchResult,
  { badge: 'emerald' | 'red' | 'amber' | 'slate'; bar: string; label: string; icon: typeof Trophy }
> = {
  win: { badge: 'emerald', bar: 'bg-emerald-500', label: 'فوز', icon: Trophy },
  loss: { badge: 'red', bar: 'bg-red-500', label: 'خسارة', icon: Flag },
  draw: { badge: 'amber', bar: 'bg-amber-500', label: 'تعادل', icon: Flag },
  scheduled: { badge: 'slate', bar: 'bg-slate-400', label: 'مجدول', icon: Play },
};

/* ===================================================================== */
export function Schedules({
  matches, trainings, teams, players, onMatchesChange, onTrainingsChange, activeRole, lang,
}: SchedulesProps) {
  const t = tr(lang);
  const [tab, setTab] = useState<SubTab>('matches');

  const canEdit = activeRole === 'manager' || activeRole === 'coach';

  /* match modal / delete state */
  const [showMatch, setShowMatch] = useState(false);
  const [editMatch, setEditMatch] = useState<Match | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);

  /* training modal / delete state */
  const [showTraining, setShowTraining] = useState(false);
  const [editTraining, setEditTraining] = useState<Training | null>(null);
  const [deleteTrainingId, setDeleteTrainingId] = useState<string | null>(null);

  const teamName = (teamId: string) => teams.find((tm) => tm.id === teamId)?.name || 'فريق غير معروف';
  const teamPlayersCount = (teamId: string) => players.filter((p) => p.teamId === teamId).length;

  /* ---------- KPI calculations ---------- */
  const totalMatches = matches.length;
  const wins = matches.filter((m) => m.result === 'win').length;
  const scheduled = matches.filter((m) => m.result === 'scheduled').length;
  const goalsScored = matches
    .filter((m) => m.result !== 'scheduled')
    .reduce((sum, m) => sum + (m.academyScore || 0), 0);

  const totalTrainings = trainings.length;
  const totalMinutes = trainings.reduce((sum, tr) => sum + (tr.durationMinutes || 0), 0);

  /* ---------- handlers: matches ---------- */
  const handleSaveMatch = (data: Omit<Match, 'id'>, id?: string) => {
    if (id) {
      onMatchesChange(matches.map((m) => (m.id === id ? { ...data, id } : m)));
    } else {
      onMatchesChange([...matches, { ...data, id: `match-${Date.now()}` }]);
    }
    setShowMatch(false);
    setEditMatch(null);
  };

  const handleDeleteMatch = () => {
    if (deleteMatchId) onMatchesChange(matches.filter((m) => m.id !== deleteMatchId));
    setDeleteMatchId(null);
  };

  /* ---------- handlers: trainings ---------- */
  const handleSaveTraining = (data: TrainingForm, id?: string) => {
    if (id) {
      onTrainingsChange(trainings.map((tr) => (tr.id === id ? { ...data, id } : tr)));
    } else {
      onTrainingsChange([...trainings, { ...data, id: `training-${Date.now()}` }]);
    }
    setShowTraining(false);
    setEditTraining(null);
  };

  const handleDeleteTraining = () => {
    if (deleteTrainingId) onTrainingsChange(trainings.filter((tr) => tr.id !== deleteTrainingId));
    setDeleteTrainingId(null);
  };

  return (
    <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader title={t.schedules} subtitle="جدولة المباريات والتدريبات وإدارة نتائج الفرق">
        {canEdit && tab === 'matches' && (
          <button
            onClick={() => setShowMatch(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            إضافة مباراة
          </button>
        )}
        {canEdit && tab === 'trainings' && (
          <button
            onClick={() => setShowTraining(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            إضافة تدريب
          </button>
        )}
      </PageHeader>

      {/* ---------------- Sub-tab navigation ---------------- */}
      <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit">
        <button
          onClick={() => setTab('matches')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${
            tab === 'matches'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Trophy className="h-4 w-4" />
          المباريات
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === 'matches' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
            {totalMatches}
          </span>
        </button>
        <button
          onClick={() => setTab('trainings')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${
            tab === 'trainings'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Dumbbell className="h-4 w-4" />
          التدريبات
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${tab === 'trainings' ? 'bg-white/20' : 'bg-slate-200 dark:bg-slate-700'}`}>
            {totalTrainings}
          </span>
        </button>
      </div>

      {/* ============================================================= */}
      {/* MATCHES TAB                                                    */}
      {/* ============================================================= */}
      {tab === 'matches' && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<CalendarDays className="h-5 w-5" />}
              label="إجمالي المباريات"
              value={totalMatches}
              sublabel="كل المباريات المسجلة"
              color="blue"
            />
            <StatCard
              icon={<Trophy className="h-5 w-5" />}
              label="الانتصارات"
              value={wins}
              sublabel={totalMatches > 0 ? `${Math.round((wins / totalMatches) * 100)}% نسبة الفوز` : '—'}
              color="emerald"
            />
            <StatCard
              icon={<Play className="h-5 w-5" />}
              label="مباريات قادمة"
              value={scheduled}
              sublabel="مجدولة بانتظار اللعب"
              color="amber"
            />
            <StatCard
              icon={<Target className="h-5 w-5" />}
              label="الأهداف المسجلة"
              value={goalsScored}
              sublabel="أهداف الأكاديمية"
              color="red"
            />
          </div>

          {/* Match cards */}
          {matches.length === 0 ? (
            <EmptyState
              icon={<Trophy className="h-8 w-8" />}
              title="لا توجد مباريات مسجلة"
              subtitle="ابدأ بإضافة مباراة جديدة لمتابعة النتائج والمواعيد"
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {matches
                .slice()
                .sort((a, b) => new Date(b.matchDate).getTime() - new Date(a.matchDate).getTime())
                .map((m) => {
                  const rs = RESULT_STYLES[m.result];
                  const completed = m.result !== 'scheduled';
                  const teamCount = teamPlayersCount(m.teamId);
                  return (
                    <div
                      key={m.id}
                      className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                    >
                      {/* left color bar based on result (right side in RTL) */}
                      <div className={`absolute top-0 bottom-0 right-0 w-1.5 ${rs.bar}`} />

                      {/* header row */}
                      <div className="flex items-start justify-between gap-3 mb-4 pr-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${rs.bar} flex items-center justify-center text-white shrink-0 shadow-lg`}>
                            <rs.icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                              {teamName(m.teamId)}
                            </p>
                            <p className="text-[11px] font-bold text-slate-400">ضد {m.opponent}</p>
                          </div>
                        </div>
                        <Badge color={rs.badge}>{rs.label}</Badge>
                      </div>

                      {/* score */}
                      {completed && (
                        <div className="flex items-center justify-center gap-3 mb-4 pr-2 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                            {m.academyScore}
                          </span>
                          <span className="text-xs font-bold text-slate-400">—</span>
                          <span className="text-2xl font-black text-slate-500 dark:text-slate-400 tabular-nums">
                            {m.opponentScore}
                          </span>
                        </div>
                      )}

                      {/* meta */}
                      <div className="space-y-2.5 text-[12px] text-slate-500 dark:text-slate-400 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CalendarDays className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold">{formatArabicDate(m.matchDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold" dir="ltr">{formatArabicTime(m.matchDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold">{m.location || 'غير محدد'}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold">{teamCount} لاعب في التشكيلة</span>
                        </div>
                        {m.scorers && (
                          <div className="flex items-start gap-2">
                            <Target className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="font-semibold leading-relaxed">{m.scorers}</span>
                          </div>
                        )}
                        {m.notes && (
                          <div className="flex items-start gap-2">
                            <FileText className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="font-semibold leading-relaxed">{m.notes}</span>
                          </div>
                        )}
                      </div>

                      {/* actions */}
                      {canEdit && (
                        <div className="flex items-center gap-1 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 pr-2">
                          <button
                            onClick={() => setEditMatch(m)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" /> {t.edit}
                          </button>
                          <button
                            onClick={() => setDeleteMatchId(m.id)}
                            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TRAININGS TAB                                                  */}
      {/* ============================================================= */}
      {tab === 'trainings' && (
        <div className="space-y-5">
          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={<Dumbbell className="h-5 w-5" />}
              label="إجمالي الجلسات"
              value={totalTrainings}
              sublabel="جلسات تدريبية مسجلة"
              color="emerald"
            />
            <StatCard
              icon={<Clock className="h-5 w-5" />}
              label="إجمالي الدقائق"
              value={totalMinutes}
              sublabel={totalTrainings > 0 ? `${Math.round(totalMinutes / totalTrainings)} دقيقة / جلسة` : '—'}
              color="blue"
            />
            <StatCard
              icon={<CalendarDays className="h-5 w-5" />}
              label="متوسط المدة"
              value={totalTrainings > 0 ? `${Math.round(totalMinutes / totalTrainings)}` : 0}
              sublabel="دقيقة لكل تدريب"
              color="amber"
            />
            <StatCard
              icon={<Target className="h-5 w-5" />}
              label="الأهداف التدريبية"
              value={trainings.filter((tr) => tr.objectives).length}
              sublabel="جلسات بأهداف محددة"
              color="red"
            />
          </div>

          {/* Training cards */}
          {trainings.length === 0 ? (
            <EmptyState
              icon={<Dumbbell className="h-8 w-8" />}
              title="لا توجد تدريبات مسجلة"
              subtitle="ابدأ بإضافة جلسة تدريبية جديدة لتنظيم برنامج الفرق"
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {trainings
                .slice()
                .sort((a, b) => new Date(b.sessionDate).getTime() - new Date(a.sessionDate).getTime())
                .map((tr) => {
                  const teamCount = teamPlayersCount(tr.teamId);
                  return (
                    <div
                      key={tr.id}
                      className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                    >
                      {/* emerald accent bar */}
                      <div className="absolute top-0 bottom-0 right-0 w-1.5 bg-emerald-500" />

                      {/* header */}
                      <div className="flex items-start justify-between gap-3 mb-4 pr-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0 shadow-lg">
                            <Dumbbell className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                              {tr.title}
                            </p>
                            <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              {teamName(tr.teamId)}
                            </p>
                          </div>
                        </div>
                        <Badge color="emerald">
                          <Clock className="h-3 w-3" /> {tr.durationMinutes} د
                        </Badge>
                      </div>

                      {/* meta */}
                      <div className="space-y-2.5 text-[12px] text-slate-500 dark:text-slate-400 pr-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CalendarDays className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold">{formatArabicDate(tr.sessionDate)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold">المدة: {tr.durationMinutes} دقيقة</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 shrink-0 text-emerald-500" />
                          <span className="font-semibold">{teamCount} لاعب في الفريق</span>
                        </div>
                        {tr.objectives && (
                          <div className="flex items-start gap-2 mt-1 p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20">
                            <Target className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                            <span className="font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
                              {tr.objectives}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* actions */}
                      {canEdit && (
                        <div className="flex items-center gap-1 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 pr-2">
                          <button
                            onClick={() => setEditTraining(tr)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer"
                          >
                            <Edit2 className="h-3.5 w-3.5" /> {t.edit}
                          </button>
                          <button
                            onClick={() => setDeleteTrainingId(tr.id)}
                            className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* MODALS                                                         */}
      {/* ============================================================= */}
      {(showMatch || editMatch) && (
        <MatchForm
          match={editMatch}
          teams={teams}
          onSave={handleSaveMatch}
          onClose={() => {
            setShowMatch(false);
            setEditMatch(null);
          }}
        />
      )}

      {(showTraining || editTraining) && (
        <TrainingForm
          training={editTraining}
          teams={teams}
          onSave={handleSaveTraining}
          onClose={() => {
            setShowTraining(false);
            setEditTraining(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteMatchId}
        onClose={() => setDeleteMatchId(null)}
        onConfirm={handleDeleteMatch}
        title="حذف المباراة"
        message="هل أنت متأكد من حذف هذه المباراة؟ سيتم إزالة كل بيانات النتيجة والملاحظات ولا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />

      <ConfirmDialog
        open={!!deleteTrainingId}
        onClose={() => setDeleteTrainingId(null)}
        onConfirm={handleDeleteTraining}
        title="حذف التدريب"
        message="هل أنت متأكد من حذف هذه الجلسة التدريبية؟ سيتم إزالة أهداف التدريب ومدته ولا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />
    </div>
  );
}

/* ===================================================================== */
/* MATCH FORM                                                            */
/* ===================================================================== */
function MatchForm({
  match,
  teams,
  onSave,
  onClose,
}: {
  match: Match | null;
  teams: Team[];
  onSave: (data: Omit<Match, 'id'>, id?: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    teamId: match?.teamId || teams[0]?.id || '',
    opponent: match?.opponent || '',
    matchDate: match?.matchDate ? toLocalDatetime(match.matchDate) : '',
    location: match?.location || '',
    result: (match?.result || 'scheduled') as MatchResult,
    academyScore: match?.academyScore ?? 0,
    opponentScore: match?.opponentScore ?? 0,
    scorers: match?.scorers || '',
    notes: match?.notes || '',
  });

  const isScheduled = form.result === 'scheduled';

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.teamId || !form.opponent || !form.matchDate) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(
      {
        teamId: form.teamId,
        opponent: form.opponent,
        matchDate: new Date(form.matchDate).toISOString(),
        location: form.location,
        result: form.result,
        academyScore: isScheduled ? 0 : Number(form.academyScore),
        opponentScore: isScheduled ? 0 : Number(form.opponentScore),
        scorers: isScheduled ? undefined : form.scorers || undefined,
        notes: form.notes || undefined,
      },
      match?.id,
    );
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={match ? 'تعديل بيانات المباراة' : 'إضافة مباراة جديدة'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الفريق">
            <select
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              className={inputCls}
              required
            >
              {teams.length === 0 && <option value="">لا توجد فرق</option>}
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name} — {tm.ageGroup}
                </option>
              ))}
            </select>
          </Field>

          <Field label="الفريق المنافس">
            <input
              value={form.opponent}
              onChange={(e) => setForm({ ...form, opponent: e.target.value })}
              placeholder="مثال: أكاديمية النصر"
              className={inputCls}
              required
            />
          </Field>

          <Field label="تاريخ ووقت المباراة">
            <input
              type="datetime-local"
              value={form.matchDate}
              onChange={(e) => setForm({ ...form, matchDate: e.target.value })}
              className={inputCls}
              dir="ltr"
              required
            />
          </Field>

          <Field label="الموقع / الملعب">
            <input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="مثال: ملعب الأكاديمية رقم 1"
              className={inputCls}
            />
          </Field>

          <Field label="النتيجة">
            <select
              value={form.result}
              onChange={(e) => setForm({ ...form, result: e.target.value as MatchResult })}
              className={inputCls}
            >
              <option value="scheduled">مجدول</option>
              <option value="win">فوز</option>
              <option value="loss">خسارة</option>
              <option value="draw">تعادل</option>
            </select>
          </Field>
        </div>

        {/* score fields — hidden when scheduled */}
        {!isScheduled && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
            <Field label="أهداف الأكاديمية">
              <input
                type="number"
                min={0}
                value={form.academyScore}
                onChange={(e) => setForm({ ...form, academyScore: Number(e.target.value) })}
                className={inputCls}
                dir="ltr"
              />
            </Field>
            <Field label="أهداف الخصم">
              <input
                type="number"
                min={0}
                value={form.opponentScore}
                onChange={(e) => setForm({ ...form, opponentScore: Number(e.target.value) })}
                className={inputCls}
                dir="ltr"
              />
            </Field>
            <div className="col-span-2">
              <Field label="هدافو المباراة">
                <input
                  value={form.scorers}
                  onChange={(e) => setForm({ ...form, scorers: e.target.value })}
                  placeholder="مثال: أحمد علي (15')، خالد محمد (42')"
                  className={inputCls}
                />
              </Field>
            </div>
          </div>
        )}

        <Field label="ملاحظات">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="ملاحظات إدارية أو فنية حول المباراة..."
            rows={3}
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            إلغاء
          </button>
          <SaveButton loading={saving}>حفظ</SaveButton>
        </div>
      </form>
    </Modal>
  );
}

/* ===================================================================== */
/* TRAINING FORM                                                         */
/* ===================================================================== */
function TrainingForm({
  training,
  teams,
  onSave,
  onClose,
}: {
  training: Training | null;
  teams: Team[];
  onSave: (data: TrainingForm, id?: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    teamId: training?.teamId || teams[0]?.id || '',
    title: training?.title || '',
    sessionDate: training?.sessionDate || '',
    durationMinutes: training?.durationMinutes ?? 60,
    objectives: training?.objectives || '',
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.teamId || !form.title || !form.sessionDate) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(
      {
        teamId: form.teamId,
        title: form.title,
        sessionDate: form.sessionDate,
        durationMinutes: Number(form.durationMinutes),
        objectives: form.objectives,
      },
      training?.id,
    );
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={training ? 'تعديل بيانات التدريب' : 'إضافة تدريب جديد'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الفريق">
            <select
              value={form.teamId}
              onChange={(e) => setForm({ ...form, teamId: e.target.value })}
              className={inputCls}
              required
            >
              {teams.length === 0 && <option value="">لا توجد فرق</option>}
              {teams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name} — {tm.ageGroup}
                </option>
              ))}
            </select>
          </Field>

          <Field label="عنوان التدريب">
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="مثال: تدريب التمرير والاستلام"
              className={inputCls}
              required
            />
          </Field>

          <Field label="تاريخ الجلسة">
            <input
              type="date"
              value={form.sessionDate}
              onChange={(e) => setForm({ ...form, sessionDate: e.target.value })}
              className={inputCls}
              dir="ltr"
              required
            />
          </Field>

          <Field label="المدة (دقائق)">
            <input
              type="number"
              min={1}
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: Number(e.target.value) })}
              className={inputCls}
              dir="ltr"
              required
            />
          </Field>
        </div>

        <Field label="أهداف الجلسة">
          <textarea
            value={form.objectives}
            onChange={(e) => setForm({ ...form, objectives: e.target.value })}
            placeholder="الأهداف الفنية والبدنية للجلسة التدريبية..."
            rows={4}
            className={`${inputCls} resize-none`}
          />
        </Field>

        <div className="flex gap-2 justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
          >
            إلغاء
          </button>
          <SaveButton loading={saving}>حفظ</SaveButton>
        </div>
      </form>
    </Modal>
  );
}

/* ===================================================================== */
/* shared helpers                                                        */
/* ===================================================================== */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

/** Convert an ISO date string to the value format expected by datetime-local input. */
function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
