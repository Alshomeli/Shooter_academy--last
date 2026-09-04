import { useState, useMemo, useDeferredValue, type FormEvent } from 'react';
import {
  Dumbbell, Plus, Search, Edit2, Trash2, Eye, Mail, Phone, Award, Star,
  Briefcase, Calendar,
} from 'lucide-react';
import type { Staff, Team, Player, Lang, Role } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, SaveButton } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { ContactLinks } from '@/components/ContactLinks';

interface StaffProps {
  staff: Staff[];
  teams: Team[];
  players: Player[];
  onStaffChange: (s: Staff[]) => void;
  activeRole: Role;
  lang: Lang;
}

const ROLE_LABELS: Record<Role, string> = {
  manager: 'مدير النظام',
  accountant: 'المحاسب المالي',
  coach: 'الكابتن / المدرب',
  receptionist: 'موظف الاستقبال',
  parent: 'ولي الأمر',
};

const ROLE_COLORS: Record<string, 'emerald' | 'blue' | 'amber' | 'slate'> = {
  manager: 'emerald',
  accountant: 'blue',
  coach: 'amber',
  receptionist: 'slate',
};

const ROLE_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'كل الأدوار' },
  { value: 'manager', label: 'مدير النظام' },
  { value: 'accountant', label: 'المحاسب المالي' },
  { value: 'coach', label: 'الكابتن / المدرب' },
  { value: 'receptionist', label: 'موظف الاستقبال' },
];

export function StaffView({ staff, teams, players, onStaffChange, activeRole, lang }: StaffProps) {
  const t = tr(lang);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [roleFilter, setRoleFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editMember, setEditMember] = useState<Staff | null>(null);
  const [viewMember, setViewMember] = useState<Staff | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canManage = activeRole === 'manager';
  const canSeeSalary = activeRole === 'manager' || activeRole === 'accountant';

  const filtered = useMemo(() => {
    return staff.filter((s) => {
      if (deferredSearch) {
        const q = deferredSearch.toLowerCase();
        const matches =
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          s.specialization.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (roleFilter !== 'all' && s.role !== roleFilter) return false;
      return true;
    });
  }, [staff, deferredSearch, roleFilter]);

  const coachTeams = (coachId: string) =>
    teams.filter((tm) => tm.coachId === coachId).map((tm) => tm.name);

  const coachPlayerCount = (coachId: string) => {
    const teamIds = teams.filter((tm) => tm.coachId === coachId).map((tm) => tm.id);
    return players.filter((p) => teamIds.includes(p.teamId)).length;
  };

  const handleSave = (data: Omit<Staff, 'id'>, id?: string) => {
    if (id) {
      onStaffChange(staff.map((s) => (s.id === id ? { ...data, id } : s)));
    } else {
      onStaffChange([...staff, { ...data, id: `staff-${Date.now()}` }]);
    }
    setShowAdd(false);
    setEditMember(null);
  };

  const handleDelete = () => {
    if (deleteId) onStaffChange(staff.filter((s) => s.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader title={t.staff} subtitle={`${staff.length} موظف ومدرب مسجل في الأكاديمية`}>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {t.add}
          </button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالاسم أو البريد أو التخصص..."
            className="w-full bg-white dark:bg-slate-900 text-sm py-2.5 pr-10 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ROLE_FILTERS.map((rf) => (
            <button
              key={rf.value}
              onClick={() => setRoleFilter(rf.value)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                roleFilter === rf.value
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
              }`}
            >
              {rf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Staff grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Dumbbell className="h-8 w-8" />}
          title="لا يوجد موظفون مطابقون"
          subtitle="جرّب تعديل الفلاتر أو أضف موظفاً جديداً"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((s) => {
            const isCoach = s.role === 'coach';
            return (
              <div
                key={s.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-shadow group"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-2xl shrink-0">
                      {s.avatarUrl || '👤'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white truncate">{s.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">{s.specialization}</p>
                    </div>
                  </div>
                  <Badge color={s.status === 'active' ? 'emerald' : s.status === 'pending' ? 'amber' : 'slate'}>
                    {s.status === 'active' ? t.active : s.status === 'pending' ? 'قيد الانتظار' : t.inactive}
                  </Badge>
                </div>

                {/* Role badge */}
                <div className="flex items-center gap-2 mb-3">
                  <Badge color={ROLE_COLORS[s.role] || 'slate'}>{ROLE_LABELS[s.role]}</Badge>
                  {canSeeSalary && (
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      {s.salary.toLocaleString()} {t.currency}
                    </span>
                  )}
                </div>

                {/* Coach-specific block */}
                {isCoach && (
                  <div className="mb-3 p-2.5 rounded-xl bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 space-y-1.5">
                    {typeof s.rating === 'number' && (
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            className={`h-3.5 w-3.5 ${
                              i <= Math.round(s.rating!)
                                ? 'fill-amber-400 text-amber-400'
                                : 'fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700'
                            }`}
                          />
                        ))}
                        <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mr-1">
                          {s.rating.toFixed(1)}
                        </span>
                      </div>
                    )}
                    {s.tacticalStyle && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <Dumbbell className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{s.tacticalStyle}</span>
                      </div>
                    )}
                    {s.licenses && s.licenses.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <Award className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{s.licenses.join('، ')}</span>
                      </div>
                    )}
                    {typeof s.experienceYears === 'number' && (
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300">
                        <Briefcase className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span>{s.experienceYears} سنوات خبرة</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Contact */}
                <div className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span dir="ltr">{s.phone}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span dir="ltr" className="truncate">{s.email}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <ContactLinks phone={s.phone} email={s.email} small />
                  <button
                    onClick={() => setViewMember(s)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" /> عرض
                  </button>
                  {canManage && (
                    <>
                      <button
                        onClick={() => setEditMember(s)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> تعديل
                      </button>
                      <button
                        onClick={() => setDeleteId(s.id)}
                        className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit modal */}
      {(showAdd || editMember) && (
        <StaffForm
          member={editMember}
          onSave={handleSave}
          onClose={() => {
            setShowAdd(false);
            setEditMember(null);
          }}
        />
      )}

      {/* View modal */}
      {viewMember && (
        <Modal open onClose={() => setViewMember(null)} title="ملف الموظف" size="lg">
          <StaffDetail
            member={viewMember}
            teams={coachTeams(viewMember.id)}
            playerCount={coachPlayerCount(viewMember.id)}
            canSeeSalary={canSeeSalary}
            lang={lang}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="حذف الموظف"
        message="هل أنت متأكد من حذف هذا الموظف؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />
    </div>
  );
}

/* ----------------------------- Form ----------------------------- */

function StaffForm({
  member,
  onSave,
  onClose,
}: {
  member: Staff | null;
  onSave: (data: Omit<Staff, 'id'>, id?: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: member?.name || '',
    email: member?.email || '',
    phone: member?.phone || '',
    role: member?.role || 'coach',
    salary: member?.salary ?? 0,
    specialization: member?.specialization || '',
    status: member?.status || 'active',
    joinedDate: member?.joinedDate || new Date().toISOString().substring(0, 10),
    avatarUrl: member?.avatarUrl || '👤',
    nationalId: member?.nationalId || '',
    experienceYears: member?.experienceYears ?? 0,
    rating: member?.rating ?? 0,
    tacticalStyle: member?.tacticalStyle || '',
    licenses: member?.licenses?.join('، ') || '',
    notes: member?.notes || '',
  });

  const isCoach = form.role === 'coach';

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    const licensesArray = form.licenses
      .split('،')
      .map((l) => l.trim())
      .filter(Boolean);
    onSave(
      {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role as Role,
        salary: Number(form.salary) || 0,
        specialization: form.specialization,
        status: form.status as Staff['status'],
        joinedDate: form.joinedDate,
        avatarUrl: form.avatarUrl,
        nationalId: form.nationalId || undefined,
        experienceYears: isCoach ? Number(form.experienceYears) || 0 : undefined,
        rating: isCoach ? Number(form.rating) || 0 : undefined,
        tacticalStyle: isCoach ? form.tacticalStyle || undefined : undefined,
        licenses: isCoach ? licensesArray : undefined,
        notes: form.notes || undefined,
      },
      member?.id,
    );
    setSaving(false);
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal open onClose={onClose} title={member ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الاسم بالكامل">
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} required />
          </Field>
          <Field label="البريد الإلكتروني">
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={inputCls} dir="ltr" required />
          </Field>
          <Field label="رقم الهاتف">
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} dir="ltr" />
          </Field>
          <Field label="الدور الوظيفي">
            <select value={form.role} onChange={(e) => set('role', e.target.value as Role)} className={inputCls}>
              <option value="manager">مدير النظام</option>
              <option value="accountant">المحاسب المالي</option>
              <option value="coach">الكابتن / المدرب</option>
              <option value="receptionist">موظف الاستقبال</option>
            </select>
          </Field>
          <Field label="الراتب الشهري">
            <input
              type="number"
              min={0}
              value={form.salary}
              onChange={(e) => set('salary', Number(e.target.value) || 0)}
              className={inputCls}
            />
          </Field>
          <Field label="التخصص / القسم">
            <input value={form.specialization} onChange={(e) => set('specialization', e.target.value)} className={inputCls} />
          </Field>
          <Field label="الحالة">
            <select value={form.status} onChange={(e) => set('status', e.target.value as Staff['status'])} className={inputCls}>
              <option value="active">نشط</option>
              <option value="inactive">موقوف</option>
              <option value="pending">قيد الانتظار</option>
            </select>
          </Field>
          <Field label="تاريخ الانضمام">
            <input type="date" value={form.joinedDate} onChange={(e) => set('joinedDate', e.target.value)} className={inputCls} />
          </Field>
          <Field label="الرمز التعبيري (Avatar)">
            <input value={form.avatarUrl} onChange={(e) => set('avatarUrl', e.target.value)} className={inputCls} maxLength={4} />
          </Field>
          <Field label="الرقم الوطني">
            <input value={form.nationalId} onChange={(e) => set('nationalId', e.target.value)} className={inputCls} dir="ltr" />
          </Field>
        </div>

        {/* Coach-specific fields */}
        {isCoach && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-xl bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20">
            <Field label="سنوات الخبرة">
              <input
                type="number"
                min={0}
                value={form.experienceYears}
                onChange={(e) => set('experienceYears', Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
            <Field label="التقييم (0 - 5)">
              <input
                type="number"
                min={0}
                max={5}
                step={0.1}
                value={form.rating}
                onChange={(e) => set('rating', Number(e.target.value) || 0)}
                className={inputCls}
              />
            </Field>
            <Field label="الأسلوب التكتيكي">
              <input value={form.tacticalStyle} onChange={(e) => set('tacticalStyle', e.target.value)} className={inputCls} />
            </Field>
            <Field label="التراخيص والشهادات (افصل بفاصلة ،)">
              <input value={form.licenses} onChange={(e) => set('licenses', e.target.value)} className={inputCls} />
            </Field>
          </div>
        )}

        <Field label="ملاحظات">
          <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} className={inputCls} />
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

/* --------------------------- Detail view --------------------------- */

function StaffDetail({
  member,
  teams,
  playerCount,
  canSeeSalary,
  lang,
}: {
  member: Staff;
  teams: string[];
  playerCount: number;
  canSeeSalary: boolean;
  lang: Lang;
}) {
  const t = tr(lang);
  const isCoach = member.role === 'coach';

  return (
    <div className="space-y-4">
      {/* Identity */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 flex items-center justify-center text-3xl">
          {member.avatarUrl || '👤'}
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">{member.name}</h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge color={ROLE_COLORS[member.role] || 'slate'}>{ROLE_LABELS[member.role]}</Badge>
            <Badge color={member.status === 'active' ? 'emerald' : member.status === 'pending' ? 'amber' : 'slate'}>
              {member.status === 'active' ? t.active : member.status === 'pending' ? 'قيد الانتظار' : t.inactive}
            </Badge>
          </div>
          {member.specialization && (
            <p className="text-sm text-slate-400 mt-1">{member.specialization}</p>
          )}
        </div>
      </div>

      {/* Coach rating block */}
      {isCoach && typeof member.rating === 'number' && (
        <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20">
          <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1.5">التقييم العام</p>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={`h-5 w-5 ${
                  i <= Math.round(member.rating!)
                    ? 'fill-amber-400 text-amber-400'
                    : 'fill-slate-200 text-slate-200 dark:fill-slate-700 dark:text-slate-700'
                }`}
              />
            ))}
            <span className="text-sm font-black text-amber-600 dark:text-amber-400 mr-2">{member.rating.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* General info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoRow label="البريد الإلكتروني" value={member.email} ltr />
        <InfoRow label="رقم الهاتف" value={member.phone} ltr />
        <InfoRow label="تاريخ الانضمام" value={member.joinedDate} />
        {member.nationalId && <InfoRow label="الرقم الوطني" value={member.nationalId} ltr />}
        {canSeeSalary && <InfoRow label="الراتب الشهري" value={`${member.salary.toLocaleString()} ${t.currency}`} />}
        <InfoRow label="التخصص" value={member.specialization || '—'} />
      </div>

      <ContactLinks phone={member.phone} email={member.email} />

      {/* Coach specifics */}
      {isCoach && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {typeof member.experienceYears === 'number' && (
            <InfoRow label="سنوات الخبرة" value={`${member.experienceYears} سنة`} />
          )}
          {member.tacticalStyle && <InfoRow label="الأسلوب التكتيكي" value={member.tacticalStyle} />}
          {teams.length > 0 && <InfoRow label="الفرق المُدرّبة" value={teams.join('، ')} />}
          <InfoRow label="عدد اللاعبين" value={`${playerCount} لاعب`} />
        </div>
      )}

      {/* Licenses */}
      {member.licenses && member.licenses.length > 0 && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
          <p className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
            <Award className="h-3.5 w-3.5" /> التراخيص والشهادات
          </p>
          <div className="flex flex-wrap gap-2">
            {member.licenses.map((lic, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30"
              >
                <Star className="h-3 w-3" /> {lic}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {member.notes && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-300">
          <p className="text-xs font-bold text-slate-400 mb-1 flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" /> ملاحظات
          </p>
          {member.notes}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Helpers ----------------------------- */

const inputCls =
  'w-full bg-slate-50 dark:bg-slate-800 text-sm py-2.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function InfoRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
      <p className="text-[11px] font-bold text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200" dir={ltr ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  );
}
