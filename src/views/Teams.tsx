import { useState, useMemo, type FormEvent } from 'react';
import {
  Trophy, Plus, Edit2, Trash2, Users, Calendar, Clock, MapPin, Phone,
} from 'lucide-react';
import type { Team, Staff, Player, Lang, Role } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, SaveButton } from '@/components/ui';
import { tr } from '@/lib/i18n';

interface TeamsProps {
  teams: Team[];
  staff: Staff[];
  players: Player[];
  onTeamsChange: (t: Team[]) => void;
  activeRole: Role;
  lang: Lang;
}

const WEEK_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 text-sm py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white';

export function Teams({ teams, staff, players, onTeamsChange, activeRole, lang }: TeamsProps) {
  const t = tr(lang);
  const [showAdd, setShowAdd] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canEdit = activeRole === 'manager' || activeRole === 'coach';

  const coachOf = (id: string) => staff.find((s) => s.id === id);
  const playersIn = (teamId: string) => players.filter((p) => p.teamId === teamId).length;

  const handleSave = (data: Omit<Team, 'id'>, id?: string) => {
    if (id) {
      onTeamsChange(teams.map((tm) => (tm.id === id ? { ...data, id } : tm)));
    } else {
      onTeamsChange([...teams, { ...data, id: `team-${Date.now()}` }]);
    }
    setShowAdd(false);
    setEditTeam(null);
  };

  const handleDelete = () => {
    if (deleteId) onTeamsChange(teams.filter((tm) => tm.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 text-right" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader title={t.teams} subtitle={`${teams.length} فئة سنية مسجلة`}>
        {canEdit && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t.add}
          </button>
        )}
      </PageHeader>

      {teams.length === 0 ? (
        <EmptyState
          icon={<Trophy className="h-8 w-8" />}
          title="لا توجد فرق مسجلة"
          subtitle="ابدأ بإضافة فئة سنية جديدة لتنظيم اللاعبين والتدريبات"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {teams.map((tm) => {
            const coach = coachOf(tm.coachId);
            const count = playersIn(tm.id);
            return (
              <div
                key={tm.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm hover:shadow-md transition-shadow group flex flex-col"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white shrink-0 shadow-lg">
                      <Trophy className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                        {tm.name}
                      </p>
                      <Badge color="emerald">{tm.ageGroup}</Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 mb-4 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <span className="text-xl shrink-0" aria-hidden>
                    {coach?.avatarUrl || '👤'}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-slate-400">المدرب المسؤول</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">
                      {coach?.name || 'غير معيّن'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-[12px] text-slate-500 dark:text-slate-400 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Calendar className="h-4 w-4 shrink-0 text-emerald-500" />
                    <div className="flex flex-wrap gap-1">
                      {tm.trainingDays.length > 0 ? (
                        tm.trainingDays.map((d) => (
                          <span
                            key={d}
                            className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-600 dark:text-slate-300"
                          >
                            {d}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400">غير محدد</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="font-semibold" dir="ltr">
                      {tm.trainingTime || 'غير محدد'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="font-semibold">ملعب رقم {tm.pitchNumber}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0 text-emerald-500" />
                    <span className="font-semibold">
                      {count} {count === 1 ? 'لاعب' : 'لاعبين'}
                    </span>
                  </div>

                  {coach?.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0 text-emerald-500" />
                      <span className="font-semibold" dir="ltr">
                        {coach.phone}
                      </span>
                    </div>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <button
                      onClick={() => setEditTeam(tm)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer"
                    >
                      <Edit2 className="h-3.5 w-3.5" /> {t.edit}
                    </button>
                    <button
                      onClick={() => setDeleteId(tm.id)}
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

      {(showAdd || editTeam) && (
        <TeamForm
          team={editTeam}
          staff={staff}
          onSave={handleSave}
          onClose={() => {
            setShowAdd(false);
            setEditTeam(null);
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={lang === 'ar' ? 'حذف الفريق' : 'Delete Team'}
        message={(() => {
          const count = deleteId ? players.filter((p) => p.teamId === deleteId).length : 0;
          if (count > 0) {
            return lang === 'ar'
              ? `تحذير: هذا الفريق يضم ${count} لاعب. سيتم إلغاء تعيينهم من الفريق. هل تريد المتابعة؟`
              : `Warning: This team has ${count} player(s). They will be unassigned. Continue?`;
          }
          return lang === 'ar'
            ? 'هل أنت متأكد من حذف هذا الفريق؟ سيتم إزالة الفئة السنية من النظام ولا يمكن التراجع عن هذا الإجراء.'
            : 'Are you sure you want to delete this team? This cannot be undone.';
        })()}
        confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
      />
    </div>
  );
}

function TeamForm({
  team,
  staff,
  onSave,
  onClose,
}: {
  team: Team | null;
  staff: Staff[];
  onSave: (data: Omit<Team, 'id'>, id?: string) => void;
  onClose: () => void;
}) {
  const eligibleCoaches = useMemo(
    () => staff.filter((s) => s.role === 'coach' || s.role === 'manager'),
    [staff],
  );

  const [form, setForm] = useState({
    name: team?.name || '',
    ageGroup: team?.ageGroup || '',
    coachId: team?.coachId || eligibleCoaches[0]?.id || '',
    trainingDays: team?.trainingDays || ([] as string[]),
    trainingTime: team?.trainingTime || '',
    pitchNumber: team?.pitchNumber || '',
  });

  const toggleDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      trainingDays: prev.trainingDays.includes(day)
        ? prev.trainingDays.filter((d) => d !== day)
        : [...prev.trainingDays, day],
    }));
  };

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.coachId) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(form, team?.id);
    setSaving(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={team ? 'تعديل بيانات الفريق' : 'إضافة فريق جديد'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="اسم الفريق">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: فئة 2014 (U-12)"
              className={inputCls}
              required
            />
          </Field>
          <Field label="الفئة العمرية">
            <input
              value={form.ageGroup}
              onChange={(e) => setForm({ ...form, ageGroup: e.target.value })}
              placeholder="مثال: U-12"
              className={inputCls}
              required
            />
          </Field>
          <Field label="المدرب المسؤول">
            <select
              value={form.coachId}
              onChange={(e) => setForm({ ...form, coachId: e.target.value })}
              className={inputCls}
              required
            >
              {eligibleCoaches.length === 0 && <option value="">لا يوجد مدربون</option>}
              {eligibleCoaches.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.avatarUrl} {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="رقم الملعب">
            <input
              value={form.pitchNumber}
              onChange={(e) => setForm({ ...form, pitchNumber: e.target.value })}
              placeholder="مثال: 1"
              className={inputCls}
            />
          </Field>
          <Field label="وقت التدريب">
            <input
              value={form.trainingTime}
              onChange={(e) => setForm({ ...form, trainingTime: e.target.value })}
              placeholder="مثال: 4:00 - 5:30 م"
              className={inputCls}
              dir="ltr"
            />
          </Field>
        </div>

        <Field label="أيام التدريب">
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            {WEEK_DAYS.map((day) => {
              const checked = form.trainingDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`py-2 px-1 rounded-lg text-xs font-bold border transition cursor-pointer ${
                    checked
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  {day}
                </button>
              );
            })}
          </div>
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
