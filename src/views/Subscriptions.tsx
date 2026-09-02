import { useState, useMemo, type FormEvent } from 'react';
import {
  Wallet, Plus, Search, CheckCircle, Clock, TrendingUp, TrendingDown,
  Receipt, DollarSign, Calendar, Edit2, Trash2, Bell, AlertCircle,
} from 'lucide-react';
import type { Subscription, Player, Parent, Transaction, Staff, Settings, Lang, Role } from '@/types';
import { Badge, Modal, ConfirmDialog, PageHeader, EmptyState, StatCard, FormField, FormError, SaveButton, inputCls } from '@/components/ui';
import { RemindersPanel } from '@/components/RemindersPanel';
import { reminderStats, getSubscriptionReminders } from '@/lib/reminders';
import { tr } from '@/lib/i18n';

interface SubscriptionsProps {
  subscriptions: Subscription[];
  transactions: Transaction[];
  players: Player[];
  parents: Parent[];
  staff: Staff[];
  settings: Settings | null;
  onSubscriptionsChange: (s: Subscription[]) => void;
  onTransactionsChange: (t: Transaction[]) => void;
  activeRole: Role;
  lang: Lang;
}

/* ----------------------------- Constants ----------------------------- */

const DEFAULT_PLAN_AMOUNTS: Record<Subscription['planType'], number> = {
  monthly: 35,
  quarterly: 90,
  yearly: 320,
};

function getPlanAmounts(settings: Settings | null): Record<Subscription['planType'], number> {
  if (!settings) return DEFAULT_PLAN_AMOUNTS;
  return {
    monthly: settings.subscriptionFeeMonthly || DEFAULT_PLAN_AMOUNTS.monthly,
    quarterly: settings.subscriptionFeeQuarterly || DEFAULT_PLAN_AMOUNTS.quarterly,
    yearly: settings.subscriptionFeeYearly || DEFAULT_PLAN_AMOUNTS.yearly,
  };
}

const PLAN_COLORS: Record<Subscription['planType'], 'blue' | 'amber' | 'emerald'> = {
  monthly: 'blue',
  quarterly: 'amber',
  yearly: 'emerald',
};

const PLAN_LABELS: Record<Subscription['planType'], string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  yearly: 'سنوي',
};

const CATEGORY_LABELS: Record<string, string> = {
  subscription: 'اشتراك',
  salary: 'رواتب',
  equipment: 'معدات',
  rent: 'إيجار',
  other: 'أخرى',
};

const CATEGORY_COLORS: Record<string, 'emerald' | 'blue' | 'amber' | 'slate'> = {
  subscription: 'emerald',
  salary: 'blue',
  equipment: 'amber',
  rent: 'slate',
  other: 'slate',
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'نقدي',
  card: 'بطاقة',
  transfer: 'تحويل بنكي',
};

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'paid', label: 'مدفوع' },
  { value: 'unpaid', label: 'غير مدفوع' },
];

const todayISO = () => new Date().toISOString().substring(0, 10);

function calcEndDate(startDate: string, planType: Subscription['planType']): string {
  const d = new Date(startDate);
  if (isNaN(d.getTime())) return startDate;
  if (planType === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (planType === 'quarterly') d.setMonth(d.getMonth() + 3);
  else if (planType === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().substring(0, 10);
}

/* ----------------------------- Main ----------------------------- */

export function Subscriptions({
  subscriptions,
  transactions,
  players,
  parents,
  staff,
  settings,
  onSubscriptionsChange,
  onTransactionsChange,
  activeRole,
  lang,
}: SubscriptionsProps) {
  const planAmounts = getPlanAmounts(settings);
  const t = tr(lang);
  const [activeTab, setActiveTab] = useState<'subscriptions' | 'transactions' | 'reminders'>('subscriptions');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAddSub, setShowAddSub] = useState(false);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [showAddTrans, setShowAddTrans] = useState(false);
  const [deleteSubId, setDeleteSubId] = useState<string | null>(null);
  const [deleteTransId, setDeleteTransId] = useState<string | null>(null);

  const canManage = activeRole === 'manager' || activeRole === 'accountant' || activeRole === 'receptionist';
  const recorderName = staff.find((s) => s.role === activeRole)?.name || 'النظام';

  /* ---- KPIs ---- */
  const totalRevenue = useMemo(
    () => transactions.filter((tx) => tx.type === 'revenue').reduce((sum, tx) => sum + tx.amount, 0),
    [transactions],
  );
  const totalExpenses = useMemo(
    () => transactions.filter((tx) => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0),
    [transactions],
  );
  const netProfit = totalRevenue - totalExpenses;
  const paidCount = subscriptions.filter((s) => s.status === 'paid').length;
  const netProfitColor: string = netProfit >= 0 ? 'emerald' : 'red';

  /* ---- Filtered subscriptions ---- */
  const filteredSubs = useMemo(() => {
    return subscriptions.filter((sub) => {
      const player = players.find((p) => p.id === sub.playerId);
      if (search) {
        const q = search.toLowerCase();
        if (!player?.name.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== 'all' && sub.status !== statusFilter) return false;
      return true;
    });
  }, [subscriptions, players, search, statusFilter]);

  const sortedTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.transactionDate.localeCompare(a.transactionDate)),
    [transactions],
  );

  const playerOf = (id: string) => players.find((p) => p.id === id);

  /* ---- Handlers ---- */
  const handleMarkPaid = (sub: Subscription) => {
    const player = playerOf(sub.playerId);
    const today = todayISO();
    onSubscriptionsChange(
      subscriptions.map((s) => (s.id === sub.id ? { ...s, status: 'paid', paidAt: today } : s)),
    );
    onTransactionsChange([
      {
        id: `txn-${Date.now()}`,
        type: 'revenue',
        category: 'subscription',
        amount: sub.amount,
        transactionDate: today,
        description: `سداد اشتراك ${player?.name || 'لاعب'} — ${PLAN_LABELS[sub.planType]}`,
        recordedBy: recorderName,
      },
      ...transactions,
    ]);
  };

  const handleSaveSub = (data: Omit<Subscription, 'id'>, id?: string) => {
    if (id) {
      onSubscriptionsChange(subscriptions.map((s) => (s.id === id ? { ...data, id } : s)));
    } else {
      onSubscriptionsChange([...subscriptions, { ...data, id: `sub-${Date.now()}` }]);
    }
    setShowAddSub(false);
    setEditSub(null);
  };

  const handleDeleteSub = () => {
    if (deleteSubId) onSubscriptionsChange(subscriptions.filter((s) => s.id !== deleteSubId));
    setDeleteSubId(null);
  };

  const handleSaveTrans = (data: Omit<Transaction, 'id'>) => {
    onTransactionsChange([{ ...data, id: `txn-${Date.now()}` }, ...transactions]);
    setShowAddTrans(false);
  };

  const handleDeleteTrans = () => {
    if (deleteTransId) onTransactionsChange(transactions.filter((tx) => tx.id !== deleteTransId));
    setDeleteTransId(null);
  };

  const addLabel = activeTab === 'subscriptions' ? 'إضافة اشتراك' : 'إضافة معاملة';

  return (
    <div className="space-y-5" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <PageHeader
        title={t.subscriptions}
        subtitle={`${subscriptions.length} اشتراك · ${transactions.length} معاملة مالية`}
      >
        {canManage && (
          <button
            onClick={() => (activeTab === 'subscriptions' ? setShowAddSub(true) : setShowAddTrans(true))}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold shadow-sm transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            {addLabel}
          </button>
        )}
      </PageHeader>

      {/* ---------------- KPIs ---------------- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="إجمالي الإيرادات"
          value={`${totalRevenue.toLocaleString()} ${t.currency}`}
          color="emerald"
          sublabel="مدخلات مالية"
        />
        <StatCard
          icon={<Receipt className="h-5 w-5" />}
          label="إجمالي المصروفات"
          value={`${totalExpenses.toLocaleString()} ${t.currency}`}
          color="red"
          sublabel="مصروفات تشغيلية"
        />
        <StatCard
          icon={<Wallet className="h-5 w-5" />}
          label="صافي الربح"
          value={`${netProfit >= 0 ? '+' : '−'}${Math.abs(netProfit).toLocaleString()} ${t.currency}`}
          color={netProfitColor}
          sublabel={netProfit >= 0 ? 'ربح صافٍ' : 'خسارة'}
        />
        <StatCard
          icon={<CheckCircle className="h-5 w-5" />}
          label="اشتراكات مدفوعة"
          value={paidCount}
          color="blue"
          sublabel={`من أصل ${subscriptions.length}`}
        />
      </div>

      {/* ---------------- Tabs ---------------- */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${
            activeTab === 'subscriptions'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Wallet className="h-4 w-4" />
          الاشتراكات
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {subscriptions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('transactions')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${
            activeTab === 'transactions'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <Receipt className="h-4 w-4" />
          المعاملات المالية
          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
            {transactions.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('reminders')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold transition cursor-pointer ${
            activeTab === 'reminders'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`
        }
        >
          <Bell className="h-4 w-4" />
          التذكيرات والتحليلات
        </button>
      </div>

      {/* ---------------- Subscriptions Tab ---------------- */}
      {activeTab === 'subscriptions' && (
        <>
          {/* Search + status filter */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-56">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث باسم اللاعب..."
                className="w-full bg-white dark:bg-slate-900 text-sm py-2.5 pr-10 pl-4 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 text-slate-800 dark:text-white"
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {STATUS_FILTERS.map((sf) => (
                <button
                  key={sf.value}
                  onClick={() => setStatusFilter(sf.value)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                    statusFilter === sf.value
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                  }`}
                >
                  {sf.label}
                </button>
              ))}
            </div>
          </div>

          {/* List */}
          {filteredSubs.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-8 w-8" />}
              title="لا توجد اشتراكات مطابقة"
              subtitle="جرّب تعديل البحث أو الفلاتر، أو أضف اشتراكاً جديداً"
            />
          ) : (
            <div className="space-y-2.5">
              {filteredSubs.map((sub) => {
                const player = playerOf(sub.playerId);
                const isPaid = sub.status === 'paid';
                return (
                  <div
                    key={sub.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                      {/* Player */}
                      <div className="flex items-center gap-2.5 flex-1 min-w-40">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-50 dark:from-emerald-900/30 dark:to-emerald-900/10 flex items-center justify-center text-sm font-black text-emerald-600 dark:text-emerald-400 shrink-0">
                          {(player?.name || '؟').charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-black text-slate-900 dark:text-white truncate">
                            {player?.name || 'لاعب غير معروف'}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge color={PLAN_COLORS[sub.planType]}>{PLAN_LABELS[sub.planType]}</Badge>
                          </div>
                        </div>
                      </div>

                      {/* Amount */}
                      <div className="min-w-28">
                        <p className="text-[11px] font-bold text-slate-400 mb-0.5 lg:hidden">المبلغ</p>
                        <p className="text-sm font-black text-slate-900 dark:text-white">
                          {sub.amount.toLocaleString()}{' '}
                          <span className="text-xs font-bold text-slate-400">{t.currency}</span>
                        </p>
                      </div>

                      {/* Dates */}
                      <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 min-w-48">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span dir="ltr">{sub.startDate}</span>
                        </div>
                        <span className="text-slate-300 dark:text-slate-600">→</span>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span dir="ltr">{sub.endDate}</span>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="min-w-24">
                        <Badge color={isPaid ? 'emerald' : 'amber'}>
                          {isPaid ? (
                            <>
                              <CheckCircle className="h-3 w-3" /> {t.paid}
                            </>
                          ) : (
                            <>
                              <Clock className="h-3 w-3" /> {t.unpaid}
                            </>
                          )}
                        </Badge>
                      </div>

                      {/* Payment method */}
                      <div className="hidden lg:block min-w-24 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                        {sub.paymentMethod ? PAYMENT_METHOD_LABELS[sub.paymentMethod] || sub.paymentMethod : '—'}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 ms-auto">
                        {!isPaid && canManage && (
                          <button
                            onClick={() => handleMarkPaid(sub)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition cursor-pointer"
                          >
                            <CheckCircle className="h-3.5 w-3.5" /> تأكيد الدفع
                          </button>
                        )}
                        {canManage && (
                          <>
                            <button
                              onClick={() => setEditSub(sub)}
                              className="flex items-center justify-center p-1.5 rounded-lg text-blue-600 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition cursor-pointer"
                              title="تعديل"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteSubId(sub.id)}
                              className="flex items-center justify-center p-1.5 rounded-lg text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer"
                              title="حذف"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Mobile-only dates */}
                    <div className="flex md:hidden items-center gap-2 text-[11px] text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span dir="ltr">{sub.startDate}</span>
                      </div>
                      <span className="text-slate-300 dark:text-slate-600">→</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span dir="ltr">{sub.endDate}</span>
                      </div>
                      <span className="ms-auto font-semibold">
                        {sub.paymentMethod ? PAYMENT_METHOD_LABELS[sub.paymentMethod] || sub.paymentMethod : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------------- Transactions Tab ---------------- */}
      {activeTab === 'transactions' && (
        <>
          {sortedTransactions.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-8 w-8" />}
              title="لا توجد معاملات مالية"
              subtitle="أضف معاملة جديدة لتسجيل الإيرادات والمصروفات"
            />
          ) : (
            <div className="space-y-2.5">
              {sortedTransactions.map((tx) => {
                const isRevenue = tx.type === 'revenue';
                return (
                  <div
                    key={tx.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-center gap-4">
                      {/* Type icon */}
                      <div
                        className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                          isRevenue
                            ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isRevenue ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
                      </div>

                      {/* Description + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <Badge color={CATEGORY_COLORS[tx.category] || 'slate'}>
                            {CATEGORY_LABELS[tx.category] || tx.category}
                          </Badge>
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            <span dir="ltr">{tx.transactionDate}</span>
                          </span>
                          <span className="text-[11px] text-slate-400 hidden sm:flex items-center gap-1">
                            · {tx.recordedBy}
                          </span>
                        </div>
                      </div>

                      {/* Amount */}
                      <div
                        className={`text-sm font-black shrink-0 ${
                          isRevenue ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {isRevenue ? '+' : '−'}
                        {tx.amount.toLocaleString()}{' '}
                        <span className="text-xs font-bold opacity-70">{t.currency}</span>
                      </div>

                      {/* Delete */}
                      {canManage && (
                        <button
                          onClick={() => setDeleteTransId(tx.id)}
                          className="flex items-center justify-center p-1.5 rounded-lg text-red-600 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 transition cursor-pointer shrink-0"
                          title="حذف"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ---------------- Reminders & Analytics Tab ---------------- */}
      {activeTab === 'reminders' && (
        <RemindersAnalyticsTab subscriptions={subscriptions} players={players} parents={parents} />
      )}

      {/* ---------------- Modals ---------------- */}
      {(showAddSub || editSub) && (
        <SubscriptionForm
          subscription={editSub}
          players={players}
          planAmounts={planAmounts}
          onSave={handleSaveSub}
          onClose={() => {
            setShowAddSub(false);
            setEditSub(null);
          }}
        />
      )}

      {showAddTrans && (
        <TransactionForm
          staff={staff}
          activeRole={activeRole}
          onSave={handleSaveTrans}
          onClose={() => setShowAddTrans(false)}
        />
      )}

      {/* ---------------- Delete confirmations ---------------- */}
      <ConfirmDialog
        open={!!deleteSubId}
        onClose={() => setDeleteSubId(null)}
        onConfirm={handleDeleteSub}
        title="حذف الاشتراك"
        message="هل أنت متأكد من حذف هذا الاشتراك؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />
      <ConfirmDialog
        open={!!deleteTransId}
        onClose={() => setDeleteTransId(null)}
        onConfirm={handleDeleteTrans}
        title="حذف المعاملة المالية"
        message="هل أنت متأكد من حذف هذه المعاملة؟ لا يمكن التراجع عن هذا الإجراء."
        confirmLabel="حذف"
      />
    </div>
  );
}

/* ----------------------- Subscription Form ----------------------- */

function SubscriptionForm({
  subscription,
  players,
  planAmounts,
  onSave,
  onClose,
}: {
  subscription: Subscription | null;
  players: Player[];
  planAmounts: Record<Subscription['planType'], number>;
  onSave: (data: Omit<Subscription, 'id'>, id?: string) => void;
  onClose: () => void;
}) {
  const today = todayISO();
  const [form, setForm] = useState({
    playerId: subscription?.playerId || '',
    planType: subscription?.planType || ('monthly' as Subscription['planType']),
    amount: subscription?.amount ?? planAmounts.monthly,
    startDate: subscription?.startDate || today,
    endDate: subscription?.endDate || calcEndDate(today, 'monthly'),
    status: subscription?.status || ('unpaid' as Subscription['status']),
    paymentMethod: subscription?.paymentMethod || 'cash',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handlePlanChange = (planType: Subscription['planType']) => {
    setForm((f) => ({
      ...f,
      planType,
      amount: planAmounts[planType],
      endDate: calcEndDate(f.startDate, planType),
    }));
  };

  const handleStartChange = (startDate: string) => {
    setForm((f) => ({
      ...f,
      startDate,
      endDate: calcEndDate(startDate, f.planType),
    }));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!form.playerId) e2.playerId = 'يرجى اختيار لاعب';
    if (!form.amount || form.amount <= 0) e2.amount = 'المبلغ يجب أن يكون أكبر من صفر';
    if (!form.startDate) e2.startDate = 'تاريخ البداية مطلوب';
    if (!form.endDate) e2.endDate = 'تاريخ النهاية مطلوب';
    if (form.startDate && form.endDate && form.startDate > form.endDate) e2.endDate = 'تاريخ النهاية يجب أن يكون بعد البداية';

    setErrors(e2);
    if (Object.keys(e2).length > 0) return;

    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave(
      {
        playerId: form.playerId,
        planType: form.planType,
        amount: Number(form.amount) || 0,
        startDate: form.startDate,
        endDate: form.endDate,
        status: form.status,
        paymentMethod: form.paymentMethod,
        paidAt: form.status === 'paid' ? subscription?.paidAt || today : undefined,
      },
      subscription?.id,
    );
    setSaving(false);
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const activePlayers = players.filter((p) => p.status === 'active');

  return (
    <Modal open onClose={onClose} title={subscription ? 'تعديل بيانات الاشتراك' : 'إضافة اشتراك جديد'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <FormError message="يرجى تصحيح الحقول المظللة بالأحمر" />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="اللاعب" error={errors.playerId}>
            <select
              value={form.playerId}
              onChange={(e) => { set('playerId', e.target.value); setErrors((p) => ({ ...p, playerId: '' })); }}
              className={`${inputCls} ${errors.playerId ? 'border-red-400 ring-1 ring-red-400' : ''}`}
              required
            >
              <option value="">— اختر اللاعب —</option>
              {activePlayers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              {subscription &&
                !activePlayers.find((p) => p.id === subscription.playerId) &&
                (() => {
                  const p = players.find((pl) => pl.id === subscription.playerId);
                  return p ? (
                    <option value={p.id}>{p.name} (غير نشط)</option>
                  ) : null;
                })()}
            </select>
          </FormField>

          <FormField label="نوع الباقة">
            <select
              value={form.planType}
              onChange={(e) => handlePlanChange(e.target.value as Subscription['planType'])}
              className={inputCls}
            >
              <option value="monthly">شهري — 25</option>
              <option value="quarterly">ربع سنوي 75</option>
              <option value="yearly">سنوي — 300</option>
            </select>
          </FormField>

          <FormField label="المبلغ" error={errors.amount}>
            <input
              type="number"
              min={0}
              value={form.amount}
              onChange={(e) => { set('amount', Number(e.target.value) || 0); setErrors((p) => ({ ...p, amount: '' })); }}
              className={`${inputCls} ${errors.amount ? 'border-red-400 ring-1 ring-red-400' : ''}`}
            />
          </FormField>

          <FormField label="طريقة الدفع">
            <select
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
              className={inputCls}
            >
              <option value="cash">نقدي</option>
              <option value="card">بطاقة</option>
              <option value="transfer">تحويل بنكي</option>
            </select>
          </FormField>

          <FormField label="تاريخ البداية" error={errors.startDate}>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => { handleStartChange(e.target.value); setErrors((p) => ({ ...p, startDate: '' })); }}
              className={`${inputCls} ${errors.startDate ? 'border-red-400 ring-1 ring-red-400' : ''}`}
            />
          </FormField>

          <FormField label="تاريخ النهاية" error={errors.endDate}>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => { set('endDate', e.target.value); setErrors((p) => ({ ...p, endDate: '' })); }}
              className={`${inputCls} ${errors.endDate ? 'border-red-400 ring-1 ring-red-400' : ''}`}
            />
          </FormField>

          <FormField label="حالة الدفع">
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as Subscription['status'])}
              className={inputCls}
            >
              <option value="unpaid">غير مدفوع</option>
              <option value="paid">مدفوع</option>
            </select>
          </FormField>
        </div>

        {/* Auto-fill hint */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/20 text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
          <DollarSign className="h-4 w-4 shrink-0" />
          يتم تعبئة المبلغ وتاريخ النهاية تلقائياً حسب نوع الباقة، ويمكنك تعديلها يدوياً.
        </div>

        <div className="flex gap-2 justify-end pt-1">
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

/* ----------------------- Transaction Form ----------------------- */

function TransactionForm({
  staff,
  activeRole,
  onSave,
  onClose,
}: {
  staff: Staff[];
  activeRole: Role;
  onSave: (data: Omit<Transaction, 'id'>) => void;
  onClose: () => void;
}) {
  const today = todayISO();
  const defaultRecorder = staff.find((s) => s.role === activeRole)?.name || '';

  const [form, setForm] = useState({
    type: 'revenue' as Transaction['type'],
    category: 'subscription' as Transaction['category'],
    amount: 0,
    transactionDate: today,
    description: '',
    recordedBy: defaultRecorder,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!form.description.trim()) e2.description = 'الوصف مطلوب';
    if (!form.amount || form.amount <= 0) e2.amount = 'المبلغ يجب أن يكون أكبر من صفر';
    setErrors(e2);
    if (Object.keys(e2).length > 0) return;

    setSaving(true);
    await new Promise((r) => setTimeout(r, 400));
    onSave({
      type: form.type,
      category: form.category,
      amount: Number(form.amount) || 0,
      transactionDate: form.transactionDate,
      description: form.description,
      recordedBy: form.recordedBy,
    });
    setSaving(false);
  };

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal open onClose={onClose} title="إضافة معاملة مالية" size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        {Object.keys(errors).length > 0 && (
          <FormError message="يرجى تصحيح الحقول المظللة بالأحمر" />
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="نوع المعاملة">
            <select
              value={form.type}
              onChange={(e) => set('type', e.target.value as Transaction['type'])}
              className={inputCls}
            >
              <option value="revenue">إيراد</option>
              <option value="expense">مصروف</option>
            </select>
          </FormField>

          <FormField label="التصنيف">
            <select
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              className={inputCls}
            >
              <option value="subscription">اشتراك</option>
              <option value="salary">رواتب</option>
              <option value="equipment">معدات</option>
              <option value="rent">إيجار</option>
              <option value="other">أخرى</option>
            </select>
          </FormField>

          <FormField label="المبلغ" error={errors.amount}>
            <input
              type="number"
              min={0}
              value={form.amount || ''}
              onChange={(e) => { set('amount', Number(e.target.value) || 0); setErrors((p) => ({ ...p, amount: '' })); }}
              className={`${inputCls} ${errors.amount ? 'border-red-400 ring-1 ring-red-400' : ''}`}
              placeholder="0"
              required
            />
          </FormField>

          <FormField label="تاريخ المعاملة">
            <input
              type="date"
              value={form.transactionDate}
              onChange={(e) => set('transactionDate', e.target.value)}
              className={inputCls}
            />
          </FormField>

          <div className="col-span-2">
            <FormField label="الوصف" error={errors.description}>
              <input
                type="text"
                value={form.description}
                onChange={(e) => { set('description', e.target.value); setErrors((p) => ({ ...p, description: '' })); }}
                className={`${inputCls} ${errors.description ? 'border-red-400 ring-1 ring-red-400' : ''}`}
                placeholder="مثال: اشتراك شهري - لاعب"
                required
              />
            </FormField>
          </div>

          <FormField label="مسجّلة بواسطة">
            <select
              value={form.recordedBy}
              onChange={(e) => set('recordedBy', e.target.value)}
              className={inputCls}
            >
              <option value="">— اختر الموظف —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </FormField>
        </div>

        <div className="flex gap-2 justify-end pt-1">
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

/* ----------------------- Reminders & Analytics Tab ----------------------- */

function RemindersAnalyticsTab({
  subscriptions,
  players,
  parents,
}: {
  subscriptions: Subscription[];
  players: Player[];
  parents: Parent[];
}) {
  const stats = reminderStats(subscriptions, players, parents);
  const reminders = getSubscriptionReminders(subscriptions, players, parents);

  const totalSubs = subscriptions.length;
  const paidSubs = subscriptions.filter((s) => s.status === 'paid').length;
  const collectionRate = totalSubs > 0 ? Math.round((paidSubs / totalSubs) * 100) : 0;

  // Bar chart data: paid vs unpaid per plan type
  const planTypes: Subscription['planType'][] = ['monthly', 'quarterly', 'yearly'];
  const chartData = planTypes.map((plan) => {
    const planSubs = subscriptions.filter((s) => s.planType === plan);
    const paid = planSubs.filter((s) => s.status === 'paid').length;
    const unpaid = planSubs.filter((s) => s.status === 'unpaid').length;
    return { plan, paid, unpaid, total: planSubs.length };
  });
  const maxCount = Math.max(...chartData.map((d) => Math.max(d.paid, d.unpaid)), 1);

  // Payment method distribution
  const methodCounts: Record<string, number> = {};
  for (const s of subscriptions) {
    const m = s.paymentMethod || 'cash';
    methodCounts[m] = (methodCounts[m] || 0) + 1;
  }
  const methodEntries = Object.entries(methodCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-5" dir="rtl">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          icon={<AlertCircle className="h-5 w-5" />}
          label="اشتراكات متأخرة"
          value={stats.overdue}
          color="red"
          sublabel="تحتاج متابعة عاجلة"
        />
        <StatCard
          icon={<Clock className="h-5 w-5" />}
          label="قيد الانتهاء"
          value={stats.expiring}
          color="amber"
          sublabel="تنتهي قريباً"
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5" />}
          label="إجمالي المستحقات"
          value={`${stats.totalUnpaidAmount.toLocaleString()} د.ب`}
          color="emerald"
          sublabel="مبالغ غير محصّلة"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="نسبة التحصيل"
          value={`${collectionRate}%`}
          color="blue"
          sublabel={`${paidSubs} من ${totalSubs}`}
        />
      </div>

      {/* Reminders panel (full) */}
      <RemindersPanel reminders={reminders} />

      {/* Analytics section */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-5">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-black text-slate-900 dark:text-white">تحليلات الاشتراكات</h3>
        </div>

        {/* Bar chart: paid vs unpaid per plan type */}
        <div className="space-y-4 mb-6">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
            المدفوع مقابل غير المدفوع حسب نوع الباقة
          </p>
          {chartData.map((d) => (
            <div key={d.plan}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{PLAN_LABELS[d.plan]}</span>
                <span className="text-[11px] text-slate-400 font-semibold">
                  {d.paid} مدفوع · {d.unpaid} غير مدفوع
                </span>
              </div>
              <div className="space-y-1.5">
                {/* Paid bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-emerald-600 w-14 shrink-0">مدفوع</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${(d.paid / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 w-6 text-center">
                    {d.paid}
                  </span>
                </div>
                {/* Unpaid bar */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-red-600 w-14 shrink-0">غير مدفوع</span>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-red-500 rounded-full transition-all"
                      style={{ width: `${(d.unpaid / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-black text-slate-600 dark:text-slate-300 w-6 text-center">
                    {d.unpaid}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Payment patterns */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3">أنماط الدفع</p>
          <div className="flex items-center gap-2 flex-wrap">
            {methodEntries.map(([method, count]) => (
              <div
                key={method}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700"
              >
                <Badge color="blue">{PAYMENT_METHOD_LABELS[method] || method}</Badge>
                <span className="text-xs font-black text-slate-700 dark:text-slate-200">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
