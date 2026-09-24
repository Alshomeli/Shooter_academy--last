import { useState } from 'react';
import {
  ShieldCheck, CheckCircle, XCircle, Clock, UserPlus, Search, AlertCircle, Loader2,
} from 'lucide-react';
import type { Player, Staff, Lang, Role, Team } from '@/types';
import { Badge, PageHeader, EmptyState, ConfirmDialog } from '@/components/ui';
import { tr, roleLabel } from '@/lib/i18n';

interface ApprovalsProps {
  players: Player[];
  teams: Team[];
  onRefresh: () => Promise<void>;
  staff: Staff[];
  onPlayersChange: (p: Player[]) => void;
  onStaffChange: (s: Staff[]) => void;
  activeRole: Role;
  lang: Lang;
}

export function Approvals({ staff, onStaffChange, activeRole, lang }: ApprovalsProps) {
  const t = tr(lang);
  const isAr = lang === 'ar';
  const isRtl = isAr;
  const [filter, setFilter] = useState<'pending' | 'active' | 'inactive' | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [actionTarget, setActionTarget] = useState<{ id: string; action: 'approve' | 'reject' } | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  if (activeRole !== 'manager') {
    return (
      <div className="space-y-5 text-right" dir={isRtl ? 'rtl' : 'ltr'}>
        <PageHeader title={t.approvals} />
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-12 text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
            {isAr ? t.managerOnly : 'This page is available to managers only'}
          </p>
        </div>
      </div>
    );
  }

  const pendingStaff = staff.filter((s) => s.status === 'pending');
  const activeStaff = staff.filter((s) => s.status === 'active');
  const inactiveStaff = staff.filter((s) => s.status === 'inactive');

  const filtered = staff.filter((s) => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
    }
    return true;
  });

  const handleConfirm = async () => {
    if (!actionTarget || processingId) return;
    setProcessingId(actionTarget.id);
    try {
      const updated = staff.map((s) => {
        if (s.id !== actionTarget.id) return s;
        return { ...s, status: actionTarget.action === 'approve' ? 'active' as const : 'inactive' as const };
      });
      await onStaffChange(updated);
      setActionTarget(null);
    } finally {
      setProcessingId(null);
    }
  };

  const statusBadge = (status: string) => {
    if (status === 'pending') return <Badge color="amber"><Clock className="h-3 w-3" /> {t.pending}</Badge>;
    if (status === 'active') return <Badge color="emerald"><CheckCircle className="h-3 w-3" /> {t.active}</Badge>;
    return <Badge color="red"><XCircle className="h-3 w-3" /> {t.inactive}</Badge>;
  };

  return (
    <div className="space-y-5 text-right" dir={isRtl ? 'rtl' : 'ltr'}>
      <PageHeader
        title={isAr ? 'الموافقات' : 'Approvals'}
        subtitle={isAr ? 'مراجعة وقبول حسابات الموظفين الجدد' : 'Review and approve new staff accounts'}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold text-slate-500">{t.pending}</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{pendingStaff.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="h-4 w-4 text-emerald-500" />
            <span className="text-xs font-bold text-slate-500">{t.active}</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{activeStaff.length}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <XCircle className="h-4 w-4 text-red-500" />
            <span className="text-xs font-bold text-slate-500">{t.inactive}</span>
          </div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{inactiveStaff.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchStaff}
            className="w-full bg-white dark:bg-slate-900 text-sm py-2.5 pr-10 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['pending', 'active', 'inactive', 'all'] as const).map((f) => {
            const labels = { pending: t.pending, active: t.active, inactive: t.inactive, all: t.all };
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  filter === f
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                {labels[f]}
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck className="h-8 w-8" />}
          title={isAr ? 'لا توجد طلبات مطابقة' : 'No matching requests'}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((member) => (
            <div key={member.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 shadow-sm">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 ${
                  member.status === 'pending'
                    ? 'bg-gradient-to-br from-amber-500 to-amber-600'
                    : member.status === 'active'
                      ? 'bg-gradient-to-br from-emerald-500 to-emerald-600'
                      : 'bg-gradient-to-br from-slate-400 to-slate-500'
                }`}>
                  {member.status === 'pending' ? <UserPlus className="h-6 w-6" /> : <ShieldCheck className="h-6 w-6" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <p className="text-sm font-black text-slate-900 dark:text-white">{member.name}</p>
                    {statusBadge(member.status)}
                    <Badge color="blue">{roleLabel(member.role, lang)}</Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                    {member.specialization || roleLabel(member.role, lang)}
                  </p>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                    <span dir="ltr">{member.email}</span>
                    <span dir="ltr">{member.phone}</span>
                    <span>{member.joinedDate}</span>
                  </div>
                </div>
                {member.status === 'pending' && (
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => setActionTarget({ id: member.id, action: 'approve' })}
                      disabled={processingId === member.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === member.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} {t.approve}
                    </button>
                    <button
                      onClick={() => setActionTarget({ id: member.id, action: 'reject' })}
                      disabled={processingId === member.id}
                      className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingId === member.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} {t.reject}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!actionTarget}
        onClose={() => setActionTarget(null)}
        onConfirm={handleConfirm}
        title={actionTarget?.action === 'approve'
          ? (isAr ? 'قبول الطلب' : 'Approve Request')
          : (isAr ? 'رفض الطلب' : 'Reject Request')}
        message={actionTarget?.action === 'approve'
          ? (isAr ? 'هل تريد قبول هذا الطلب وتفعيل حساب المستخدم؟' : 'Approve this request and activate the user account?')
          : (isAr ? 'هل تريد رفض هذا الطلب وتعطيل الحساب؟' : 'Reject this request and deactivate the account?')}
        confirmLabel={actionTarget?.action === 'approve' ? t.approve : t.reject}
      />
    </div>
  );
}
