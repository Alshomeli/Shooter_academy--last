import { useState, useMemo, useEffect, type FormEvent } from 'react';
import {
  Users, Plus, Search, Phone, Mail, Edit2, Trash2, Eye,
  FileText,
} from 'lucide-react';
import type { Player, Team, Lang, Role } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, FormField, FormError, SaveButton, inputCls } from '@/components/ui';
import { tr } from '@/lib/i18n';
import { ContactLinks } from '@/components/ContactLinks';
import { DocumentUpload } from '@/components/DocumentUpload';
import { fetchAllPlayerFiles } from '@/lib/uploads';
import { validateRequired, validatePhone, validateEmail, validateNumber, validateJerseyUnique } from '@/lib/validation';

interface PlayersProps {
  players: Player[];
  teams: Team[];
  onPlayersChange: (p: Player[]) => void;
  activeRole: Role;
  lang: Lang;
}

const POSITIONS = ['حارس مرمى', 'مدافع', 'خط وسط', 'مهاجم'];
const BLOOD_TYPES = ['O+', 'A+', 'B+', 'AB+', 'O-', 'A-'];

const POSITION_COLORS: Record<string, 'red' | 'blue' | 'emerald' | 'amber'> = {
  'حارس مرمى': 'amber',
  'مدافع': 'blue',
  'خط وسط': 'emerald',
  'مهاجم': 'red',
};

export function Players({ players, teams, onPlayersChange, activeRole, lang }: PlayersProps) {
  const t = tr(lang);
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [viewPlayer, setViewPlayer] = useState<Player | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [photoMap, setPhotoMap] = useState<Record<string, string>>({});

  const canEdit = activeRole === 'manager' || activeRole === 'receptionist';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const files = await fetchAllPlayerFiles();
      if (cancelled) return;
      const photos: Record<string, string> = {};
      for (const f of files) {
        if (f.fileCategory === 'photo' && !photos[f.playerId]) {
          photos[f.playerId] = f.publicUrl;
        }
      }
      setPhotoMap(photos);
    })();
    return () => { cancelled = true; };
  }, [players]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.parentName.toLowerCase().includes(q)) return false;
      if (teamFilter !== 'all' && p.teamId !== teamFilter) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });
  }, [players, search, teamFilter, statusFilter]);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name || 'غير محدد';

  const handleSave = (data: Omit<Player, 'id'>, id?: string) => {
    if (id) {
      onPlayersChange(players.map((p) => (p.id === id ? { ...data, id } : p)));
    } else {
      onPlayersChange([...players, { ...data, id: `player-${Date.now()}` }]);
    }
    setShowAdd(false);
    setEditPlayer(null);
  };

  const handleDelete = () => {
    if (deleteId) onPlayersChange(players.filter((p) => p.id !== deleteId));
    setDeleteId(null);
  };

  return (
    <div className="space-y-5 text-right" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader title={t.players} subtitle={`${players.length} لاعب مسجل في الأكاديمية`}>
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
            placeholder="ابحث باسم اللاعب أو ولي الأمر..."
            className="w-full bg-white dark:bg-slate-900 text-sm py-2.5 pr-10 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white"
          />
        </div>
        <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
          <option value="all">كل الفرق</option>
          {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
          <option value="all">كل الحالات</option>
          <option value="active">نشط</option>
          <option value="inactive">موقوف</option>
        </select>
      </div>

      {/* Players grid */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="لا يوجد لاعبون مطابقون" subtitle="جرّب تعديل الفلاتر أو أضف لاعباً جديداً" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="relative bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 pt-14 pb-4 px-4 shadow-sm hover:shadow-md transition-shadow group mt-7">
              {/* Player photo / jersey fallback — floats above the card top edge */}
              <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-10">
                {photoMap[p.id] ? (
                  <img
                    src={photoMap[p.id]}
                    alt={p.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-white dark:border-slate-900 shadow-lg shadow-emerald-900/20"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-base shadow-lg shadow-emerald-600/30 border-2 border-white dark:border-slate-900">
                    #{p.jerseyNumber}
                  </div>
                )}
              </div>
              <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900 dark:text-white truncate text-center">{p.name}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 text-center">{teamName(p.teamId)}</p>
                </div>
              </div>
              <div className="flex items-center justify-center mb-3">
                <Badge color={p.status === 'active' ? 'emerald' : 'slate'}>
                  {p.status === 'active' ? t.active : t.inactive}
                </Badge>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge color={POSITION_COLORS[p.position] || 'slate'}>{p.position}</Badge>
                <span className="text-[11px] text-slate-400 font-semibold">{p.birthDate}</span>
              </div>

              <div className="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span dir="ltr">{p.parentPhone}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span dir="ltr" className="truncate">{p.parentEmail}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <ContactLinks phone={p.parentPhone} email={p.parentEmail} small />
                <button onClick={() => setViewPlayer(p)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer">
                  <Eye className="h-3.5 w-3.5" /> عرض
                </button>
                {canEdit && (
                  <>
                    <button onClick={() => setEditPlayer(p)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-bold text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer">
                      <Edit2 className="h-3.5 w-3.5" /> تعديل
                    </button>
                    <button onClick={() => setDeleteId(p.id)} className="flex items-center justify-center gap-1 py-1.5 px-2.5 rounded-lg text-[11px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {(showAdd || editPlayer) && (
        <PlayerForm
          player={editPlayer}
          teams={teams}
          players={players}
          activeRole={activeRole}
          onSave={handleSave}
          onClose={() => { setShowAdd(false); setEditPlayer(null); }}
        />
      )}

      {/* View modal */}
      {viewPlayer && (
        <Modal open onClose={() => setViewPlayer(null)} title="ملف اللاعب" size="lg">
          <PlayerDetail player={viewPlayer} team={teams.find((t) => t.id === viewPlayer.teamId)} />
        </Modal>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="حذف اللاعب"
        message="هل أنت متأكد من حذف هذا اللاعب؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />
    </div>
  );
}

function PlayerForm({ player, teams, players, activeRole, onSave, onClose }: {
  player: Player | null;
  teams: Team[];
  players: Player[];
  activeRole: Role;
  onSave: (data: Omit<Player, 'id'>, id?: string) => void;
  onClose: () => void;
}) {
  const canEditSensitive = activeRole === 'manager';
  const [form, setForm] = useState({
    name: player?.name || '',
    birthDate: player?.birthDate || '',
    bloodType: player?.bloodType || BLOOD_TYPES[0],
    jerseyNumber: player?.jerseyNumber || 1,
    position: player?.position || POSITIONS[0],
    teamId: player?.teamId || teams[0]?.id || '',
    parentName: player?.parentName || '',
    parentPhone: player?.parentPhone || '',
    parentEmail: player?.parentEmail || '',
    parentId: player?.parentId || '',
    status: player?.status || 'active',
    notes: player?.notes || '',
    joinedDate: player?.joinedDate || new Date().toISOString().substring(0, 10),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const e2: Record<string, string> = {};
    const nameCheck = validateRequired(form.name, 'الاسم');
    if (!nameCheck.valid) e2.name = nameCheck.message!;
    const teamCheck = validateRequired(form.teamId, 'الفريق');
    if (!teamCheck.valid) e2.teamId = teamCheck.message!;
    const jerseyCheck = validateNumber(form.jerseyNumber, 1, 99, 'رقم القميص');
    if (!jerseyCheck.valid) e2.jerseyNumber = jerseyCheck.message!;
    else {
      const uniqueCheck = validateJerseyUnique(form.jerseyNumber, players, player?.id);
      if (!uniqueCheck.valid) e2.jerseyNumber = uniqueCheck.message!;
    }
    const phoneCheck = validatePhone(form.parentPhone);
    if (!phoneCheck.valid) e2.parentPhone = phoneCheck.message!;
    const emailCheck = validateEmail(form.parentEmail);
    if (!emailCheck.valid) e2.parentEmail = emailCheck.message!;

    setErrors(e2);
    if (Object.keys(e2).length > 0) return;

    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(form, player?.id);
    setSaving(false);
  };

  return (
    <Modal open onClose={onClose} title={player ? 'تعديل بيانات اللاعب' : 'إضافة لاعب جديد'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <FormError message="يرجى تصحيح الحقول المظللة بالأحمر" />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="الاسم بالكامل" error={errors.name}>
            <input value={form.name} onChange={(e) => { setForm({ ...form, name: e.target.value }); setErrors((p) => ({ ...p, name: '' })); }} className={`${inputCls} ${errors.name ? 'border-red-400 ring-1 ring-red-400' : ''}`} required />
          </FormField>
          <FormField label="تاريخ الميلاد">
            <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className={inputCls} />
          </FormField>
          <FormField label="رقم القميص" error={errors.jerseyNumber}>
            <input type="number" min={1} max={99} value={form.jerseyNumber} onChange={(e) => { setForm({ ...form, jerseyNumber: parseInt(e.target.value) || 1 }); setErrors((p) => ({ ...p, jerseyNumber: '' })); }} className={`${inputCls} ${errors.jerseyNumber ? 'border-red-400 ring-1 ring-red-400' : ''}`} />
          </FormField>
          <FormField label="المركز الفني">
            <select value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} className={inputCls}>
              {POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </FormField>
          <FormField label="فئة الفريق" error={errors.teamId}>
            <select value={form.teamId} onChange={(e) => { setForm({ ...form, teamId: e.target.value }); setErrors((p) => ({ ...p, teamId: '' })); }} className={`${inputCls} ${errors.teamId ? 'border-red-400 ring-1 ring-red-400' : ''}`} required disabled={!canEditSensitive}>
              {teams.map((tm) => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
            </select>
            {!canEditSensitive && <p className="text-[10px] text-amber-500 mt-1">يُتاح تعديل الفريق للمدير فقط</p>}
          </FormField>
          <FormField label="فصيلة الدم">
            <select value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })} className={inputCls}>
              {BLOOD_TYPES.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </FormField>
          <FormField label="اسم ولي الأمر">
            <input value={form.parentName} onChange={(e) => setForm({ ...form, parentName: e.target.value })} className={inputCls} />
          </FormField>
          <FormField label="هاتف ولي الأمر" error={errors.parentPhone}>
            <input value={form.parentPhone} onChange={(e) => { setForm({ ...form, parentPhone: e.target.value }); setErrors((p) => ({ ...p, parentPhone: '' })); }} className={`${inputCls} ${errors.parentPhone ? 'border-red-400 ring-1 ring-red-400' : ''}`} dir="ltr" />
          </FormField>
          <FormField label="بريد ولي الأمر" error={errors.parentEmail}>
            <input type="email" value={form.parentEmail} onChange={(e) => { setForm({ ...form, parentEmail: e.target.value }); setErrors((p) => ({ ...p, parentEmail: '' })); }} className={`${inputCls} ${errors.parentEmail ? 'border-red-400 ring-1 ring-red-400' : ''}`} dir="ltr" disabled={!canEditSensitive} />
            {!canEditSensitive && <p className="text-[10px] text-amber-500 mt-1">يُتاح تعديل البريد للمدير فقط</p>}
          </FormField>
          <FormField label="الحالة">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'inactive' })} className={inputCls}>
              <option value="active">نشط</option>
              <option value="inactive">موقوف</option>
            </select>
          </FormField>
        </div>
        <FormField label="ملاحظات">
          <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className={inputCls} />
        </FormField>
        <div className="flex gap-2 justify-end pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer">إلغاء</button>
          <SaveButton loading={saving}>حفظ</SaveButton>
        </div>
      </form>
    </Modal>
  );
}

function PlayerDetail({ player, team }: { player: Player; team?: Team }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-white font-black text-2xl">
          #{player.jerseyNumber}
        </div>
        <div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white">{player.name}</h3>
          <p className="text-sm text-slate-400">{team?.name || 'غير محدد'}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoRow label="المركز" value={player.position} />
        <InfoRow label="تاريخ الميلاد" value={player.birthDate} />
        <InfoRow label="فصيلة الدم" value={player.bloodType} />
        <InfoRow label="رقم القميص" value={`#${player.jerseyNumber}`} />
        <InfoRow label="ولي الأمر" value={player.parentName} />
        <InfoRow label="هاتف ولي الأمر" value={player.parentPhone} ltr />
        <InfoRow label="بريد ولي الأمر" value={player.parentEmail} ltr />
        <InfoRow label="تاريخ الانضمام" value={player.joinedDate} />
      </div>
      <ContactLinks phone={player.parentPhone} email={player.parentEmail} />
      {player.notes && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-sm text-slate-600 dark:text-slate-300">
          <p className="text-xs font-bold text-slate-400 mb-1">ملاحظات</p>
          {player.notes}
        </div>
      )}

      {/* Documents & Photos section */}
      <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="h-4 w-4 text-blue-500" />
          <h4 className="text-sm font-black text-slate-900 dark:text-white">مستندات اللاعب</h4>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <DocumentUpload playerId={player.id} category="photo" label="صور اللاعب" compact />
          </div>
          <div className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <DocumentUpload playerId={player.id} category="document" label="مستندات PDF / PNG" />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
      <p className="text-[11px] font-bold text-slate-400 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-200" dir={ltr ? 'ltr' : undefined}>{value}</p>
    </div>
  );
}
