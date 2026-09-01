import { useState, useMemo, type FormEvent } from 'react';
import {
  UsersRound, Plus, Search, Phone, Mail, Edit2, Trash2, Eye, MessageSquare,
} from 'lucide-react';
import type { Parent, Player, Team, Subscription, Lang, Role } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, SaveButton } from '@/components/ui';
import { ContactLinks } from '@/components/ContactLinks';
import { tr } from '@/lib/i18n';

interface ParentsProps {
  parents: Parent[];
  players: Player[];
  teams: Team[];
  subscriptions: Subscription[];
  onParentsChange: (p: Parent[]) => void;
  activeRole: Role;
  lang: Lang;
}

const AVATAR_EMOJIS = ['👨', '👩', '🧔', '👱', '👴', '👵', '🧑', '👨‍🦰'];

export function Parents({ parents, players, teams, subscriptions, onParentsChange, activeRole, lang }: ParentsProps) {
  const t = tr(lang);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editParent, setEditParent] = useState<Parent | null>(null);
  const [viewParent, setViewParent] = useState<Parent | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const canEdit = activeRole === 'manager' || activeRole === 'receptionist';

  const filtered = useMemo(() => {
    return parents.filter((p) => {
      if (search) {
        const q = search.trim().toLowerCase();
        if (!p.name.toLowerCase().includes(q) && !p.phone.includes(search) && !p.whatsappPhone.includes(search)) return false;
      }
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });
  }, [parents, search, statusFilter]);

  const childrenOf = (parentId: string) => players.filter((pl) => pl.parentId === parentId);
  const teamName = (id: string) => teams.find((tm) => tm.id === id)?.name || 'غير محدد';
  const subOf = (playerId: string) => subscriptions.find((s) => s.playerId === playerId);

  const handleSave = (data: Omit<Parent, 'id'>, id?: string) => {
    if (id) {
      onParentsChange(parents.map((p) => (p.id === id ? { ...data, id } : p)));
    } else {
      onParentsChange([...parents, { ...data, id: `parent-${Date.now()}` }]);
    }
    setShowAdd(false);
    setEditParent(null);
  };

  const handleDelete = () => {
    if (deleteId) onParentsChange(parents.filter((p) => p.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 text-right" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader title={t.parents} subtitle={`${parents.length} ولي أمر مسجل في الأكاديمية`}>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم ولي الأمر أو رقم الهاتف..."
            className="w-full bg-white dark:bg-slate-900 text-sm py-2.5 pr-10 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">موقوف</option>
        </select>
      </div>

      {/* Parents grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-8 w-8" />}
          title="لا يوجد أولياء أمور مطابقون"
          subtitle="جرّب تعديل الفلاتر أو أضف ولي أمر جديد"
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => {
            const kids = childrenOf(p.id);
            return (
              <div
                key={p.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-xl shrink-0">
                      {p.avatarUrl || '👤'}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-slate-900 dark:text-white truncate">{p.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {p.occupation || 'غير محدد'}
                      </p>
                    </div>
                  </div>
                  <Badge color={p.status === 'active' ? 'emerald' : 'slate'}>
                    {p.status === 'active' ? t.active : t.inactive}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <Badge color="blue">
                    <UsersRound className="h-3 w-3" />
                    {kids.length} أبناء
                  </Badge>
                  {p.nationality && (
                    <span className="text-[11px] text-slate-400 font-semibold truncate">{p.nationality}</span>
                  )}
                </div>

                <div className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <a href={`tel:${p.phone.replace(/[^0-9]/g, '')}`} dir="ltr" className="hover:text-emerald-600 transition">{p.phone}</a>
                  </div>
                  {p.email && (
                    <div className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <a href={`mailto:${p.email}`} dir="ltr" className="truncate hover:text-emerald-600 transition">{p.email}</a>
                    </div>
                  )}
                  {p.address && (
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{p.address}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={() => setViewParent(p)}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
                  >
                    <Eye className="h-3.5 w-3.5" /> عرض
                  </button>
                  <ContactLinks phone={p.phone} whatsapp={p.whatsappPhone} email={p.email} address={p.address} small />
                  {canEdit && (
                    <>
                      <button
                        onClick={() => setEditParent(p)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer"
                      >
                        <Edit2 className="h-3.5 w-3.5" /> تعديل
                      </button>
                      <button
                        onClick={() => setDeleteId(p.id)}
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
      {(showAdd || editParent) && (
        <ParentForm
          parent={editParent}
          onSave={handleSave}
          onClose={() => {
            setShowAdd(false);
            setEditParent(null);
          }}
        />
      )}

      {/* View modal */}
      {viewParent && (
        <Modal open onClose={() => setViewParent(null)} title="ملف ولي الأمر" size="lg">
          <ParentDetail
            parent={viewParent}
            children={childrenOf(viewParent.id)}
            teamName={teamName}
            subOf={subOf}
          />
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title={lang === 'ar' ? 'حذف ولي الأمر' : 'Delete Parent'}
        message={(() => {
          const linked = deleteId ? childrenOf(deleteId) : [];
          if (linked.length > 0) {
            const names = linked.map((p) => p.name).join(lang === 'ar' ? '، ' : ', ');
            return lang === 'ar'
              ? `تحذير: ولي الأمر مرتبط بـ ${linked.length} لاعب (${names}). سيتم إزالة الربط مع هؤلاء اللاعبين. هل تريد المتابعة؟`
              : `Warning: This parent is linked to ${linked.length} player(s) (${names}). They will be unlinked. Continue?`;
          }
          return lang === 'ar'
            ? 'هل أنت متأكد من حذف هذا ولي الأمر؟ لا يمكن التراجع عن هذا الإجراء.'
            : 'Are you sure you want to delete this parent? This cannot be undone.';
        })()}
        confirmLabel={lang === 'ar' ? 'حذف' : 'Delete'}
      />
    </div>
  );
}

function ParentForm({
  parent,
  onSave,
  onClose,
}: {
  parent: Parent | null;
  onSave: (data: Omit<Parent, 'id'>, id?: string) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: parent?.name || '',
    nationalId: parent?.nationalId || '',
    nationality: parent?.nationality || 'بحريني',
    phone: parent?.phone || '',
    whatsappPhone: parent?.whatsappPhone || '',
    email: parent?.email || '',
    address: parent?.address || '',
    occupation: parent?.occupation || '',
    workplace: parent?.workplace || '',
    avatarUrl: parent?.avatarUrl || AVATAR_EMOJIS[Math.floor(Math.random() * AVATAR_EMOJIS.length)],
    status: parent?.status || ('active' as 'active' | 'inactive'),
    notes: parent?.notes || '',
    joinedDate: parent?.joinedDate || new Date().toISOString().substring(0, 10),
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;
    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(form, parent?.id);
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={parent ? 'تعديل بيانات ولي الأمر' : 'إضافة ولي أمر جديد'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="الاسم بالكامل">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={inputCls}
              required
            />
          </Field>
          <Field label="الرقم الوطني">
            <input
              value={form.nationalId}
              onChange={(e) => setForm({ ...form, nationalId: e.target.value })}
              className={inputCls}
              dir="ltr"
            />
          </Field>
          <Field label="الجنسية">
            <input
              value={form.nationality}
              onChange={(e) => setForm({ ...form, nationality: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="المهنة">
            <input
              value={form.occupation}
              onChange={(e) => setForm({ ...form, occupation: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="رقم الهاتف">
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              className={inputCls}
              dir="ltr"
              required
            />
          </Field>
          <Field label="رقم واتساب">
            <input
              value={form.whatsappPhone}
              onChange={(e) => setForm({ ...form, whatsappPhone: e.target.value })}
              className={inputCls}
              dir="ltr"
            />
          </Field>
          <Field label="البريد الإلكتروني">
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={inputCls}
              dir="ltr"
            />
          </Field>
          <Field label="جهة العمل">
            <input
              value={form.workplace}
              onChange={(e) => setForm({ ...form, workplace: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="العنوان">
            <input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="الحالة">
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })}
              className={inputCls}
            >
              <option value="active">نشط</option>
              <option value="inactive">موقوف</option>
            </select>
          </Field>
        </div>
        <Field label="ملاحظات">
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className={inputCls}
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

function ParentDetail({
  parent,
  children,
  teamName,
  subOf,
}: {
  parent: Parent;
  children: Player[];
  teamName: (id: string) => string;
  subOf: (playerId: string) => Subscription | undefined;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-3xl">
          {parent.avatarUrl || '👤'}
        </div>
        <div className="min-w-0">
          <h3 className="text-lg font-black text-slate-900 dark:text-white truncate">{parent.name}</h3>
          <div className="flex items-center gap-2 mt-1">
            <Badge color={parent.status === 'active' ? 'emerald' : 'slate'}>
              {parent.status === 'active' ? 'نشط' : 'موقوف'}
            </Badge>
            <span className="text-xs text-slate-400 font-semibold">{parent.occupation}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoRow label="الرقم الوطني" value={parent.nationalId || 'غير محدد'} ltr />
        <InfoRow label="الجنسية" value={parent.nationality || 'غير محدد'} />
        <InfoRow label="رقم الهاتف" value={<a href={`tel:${parent.phone.replace(/[^0-9]/g, '')}`} className="hover:text-emerald-600 transition">{parent.phone}</a>} ltr />
        <InfoRow label="رقم واتساب" value={parent.whatsappPhone ? <a href={`https://wa.me/${parent.whatsappPhone.replace(/[^0-9]/g, '')}`} target="_blank" rel="noreferrer" className="hover:text-emerald-600 transition">{parent.whatsappPhone}</a> : 'غير محدد'} ltr />
        <InfoRow label="البريد الإلكتروني" value={parent.email ? <a href={`mailto:${parent.email}`} className="hover:text-emerald-600 transition">{parent.email}</a> : 'غير محدد'} ltr />
        <InfoRow label="المهنة" value={parent.occupation || 'غير محدد'} />
        <InfoRow label="جهة العمل" value={parent.workplace || 'غير محدد'} />
        <InfoRow label="تاريخ الانضمام" value={parent.joinedDate} />
        <div className="col-span-2">
          <InfoRow label="العنوان" value={parent.address || 'غير محدد'} />
        </div>
      </div>

      <ContactLinks phone={parent.phone} whatsapp={parent.whatsappPhone} email={parent.email} address={parent.address} />

      {parent.notes && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-300">
          <p className="text-xs font-bold text-slate-400 mb-1">ملاحظات</p>
          {parent.notes}
        </div>
      )}

      {/* Children list */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <UsersRound className="h-4 w-4 text-emerald-600" />
          <h4 className="text-sm font-black text-slate-900 dark:text-white">
            الأبناء المسجلون ({children.length})
          </h4>
        </div>
        {children.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-center">
            <p className="text-xs text-slate-400 font-semibold">لا يوجد أبناء مسجلون لهذا ولي الأمر</p>
          </div>
        ) : (
          <div className="space-y-2">
            {children.map((kid) => {
              const sub = subOf(kid.id);
              return (
                <div
                  key={kid.id}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"
                >
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-sm shrink-0">
                    #{kid.jerseyNumber}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{kid.name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                      {teamName(kid.teamId)} · {kid.position}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge color={kid.status === 'active' ? 'emerald' : 'slate'}>
                      {kid.status === 'active' ? 'نشط' : 'موقوف'}
                    </Badge>
                    {sub && (
                      <Badge color={sub.status === 'paid' ? 'blue' : 'amber'}>
                        {sub.status === 'paid' ? 'مدفوع' : 'غير مدفوع'}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

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

function InfoRow({ label, value, ltr }: { label: string; value: React.ReactNode; ltr?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
      <p className="text-[11px] font-bold text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200" dir={ltr ? 'ltr' : undefined}>
        {value}
      </p>
    </div>
  );
}
