import { Printer } from 'lucide-react';
import type { Lang, Parent, Player, Settings, Subscription, Transaction } from '@/types';
import { paymentMethodLabel } from '@/lib/i18n';

type Props = {
  subscription: Subscription;
  transactions: Transaction[];
  players: Player[];
  parents: Parent[];
  settings: Settings | null;
  lang: Lang;
  onClose: () => void;
};

export function PaymentReceipt({ subscription, transactions, players, parents, settings, lang, onClose }: Props) {
  const ar = lang === 'ar';
  const player = players.find((p) => p.id === subscription.playerId);
  const parent = parents.find((p) => p.id === player?.parentId);
  const tx = transactions.find((t) => t.subscriptionId === subscription.id);
  const rawReference = tx?.id || subscription.id;
  const shortReference = rawReference.replace(/^txn-/, '').slice(0, 12).toUpperCase();
  const date = tx?.transactionDate || subscription.paidAt?.slice(0, 10) || '-';
  const method = subscription.paymentMethod || 'cash';
  const payer = parent?.name || player?.parentName || player?.name || '-';
  const academyName = settings?.name?.trim() || (ar ? 'أكاديمية شوتر' : 'Shooter Academy');
  const isCash = method === 'cash';
  const isBenefit = method === 'benefit' || method === 'benefitpay' || method === 'bank_transfer';

  return (
    <div className="receipt-modal-shell fixed inset-0 z-50 bg-black/55 p-4 overflow-y-auto" dir={ar ? 'rtl' : 'ltr'}>
      <div className="receipt-print-root max-w-3xl mx-auto bg-white text-slate-900 rounded-2xl shadow-2xl overflow-hidden">
        <div className="relative p-6 sm:p-9 min-h-[650px]">
          <div aria-hidden className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
            <div className="select-none text-[110px] sm:text-[150px] font-black tracking-tighter text-red-700/[0.035] -rotate-12">SA</div>
          </div>

          <header className="relative flex items-start justify-between gap-5 pb-5 border-b-[3px] border-red-700">
            <div>
              <div className="text-[10px] font-black tracking-[0.24em] text-red-700">SHOOTER ACADEMY</div>
              <h2 className="mt-1 text-2xl sm:text-3xl font-black">{academyName}</h2>
              <p className="text-xs text-slate-500 mt-1">{ar ? 'مملكة البحرين' : 'Kingdom of Bahrain'}</p>
            </div>
            <div className="text-end">
              <div className="inline-flex px-4 py-2 rounded-xl bg-red-700 text-white text-base font-black tracking-wider">
                {ar ? 'إيصال استلام' : 'RECEIPT'}
              </div>
              <dl className="mt-3 text-xs space-y-1">
                <div><dt className="inline font-bold">{ar ? 'رقم المرجع:' : 'No.:'}</dt> <dd className="inline font-black" dir="ltr">{shortReference}</dd></div>
                <div><dt className="inline font-bold">{ar ? 'التاريخ:' : 'DATE:'}</dt> <dd className="inline" dir="ltr">{date}</dd></div>
              </dl>
            </div>
          </header>

          <div className="relative mt-6 space-y-4 text-sm">
            <ReceiptLine label={ar ? 'استلمنا من' : 'RECEIVED FROM'} value={payer} />
            <ReceiptLine label={ar ? 'عن اللاعب' : 'FOR PLAYER'} value={player?.name || '-'} />
            <ReceiptLine label={ar ? 'المبلغ' : 'AMOUNT'} value={`${subscription.amount.toFixed(3)} BHD`} strong />
            <ReceiptLine label={ar ? 'مبلغ وقدره بالدينار البحريني' : 'THE SUM OF BHD'} value={subscription.amount.toFixed(3)} />
            <ReceiptLine
              label={ar ? 'البيان' : 'DESCRIPTION'}
              value={ar
                ? `سداد اشتراك الأكاديمية للفترة من ${subscription.startDate} إلى ${subscription.endDate}`
                : `Academy subscription payment for ${subscription.startDate} to ${subscription.endDate}`}
            />
          </div>

          <section className="relative mt-7 grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-black text-slate-500 mb-3">{ar ? 'طريقة الدفع' : 'PAYMENT METHOD'}</p>
              <div className="flex flex-wrap gap-5 text-sm font-bold">
                <CheckBox checked={isBenefit} label="BenefitPay" />
                <CheckBox checked={isCash} label={ar ? 'نقداً' : 'Cash'} />
                {!isBenefit && !isCash && <CheckBox checked label={paymentMethodLabel(method, lang)} />}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="text-xs font-black text-slate-500 mb-1">{ar ? 'مرجع المعاملة' : 'TRANSACTION REFERENCE'}</p>
              <p className="text-[11px] font-mono break-all text-slate-700" dir="ltr">{rawReference}</p>
            </div>
          </section>

          <div className="relative grid grid-cols-2 gap-10 sm:gap-20 pt-20">
            <Signature label={ar ? 'التوقيع' : 'SIGNATURE'} />
            <Signature label={ar ? 'توقيع المستلم' : 'RECEIVER SIGNATURE'} />
          </div>

          {(settings?.phone || settings?.email || settings?.address) && (
            <footer className="relative mt-10 pt-4 border-t text-[10px] text-slate-400 flex flex-wrap gap-x-4 gap-y-1 justify-center">
              {settings.address && <span>{settings.address}</span>}
              {settings.phone && <span dir="ltr">{settings.phone}</span>}
              {settings.email && <span dir="ltr">{settings.email}</span>}
            </footer>
          )}
        </div>

        <div className="receipt-actions no-print flex justify-end gap-2 p-4 border-t bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-bold">
            {ar ? 'إغلاق' : 'Close'}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-bold">
            <Printer className="h-4 w-4" />
            {ar ? 'طباعة الإيصال' : 'Print receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiptLine({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[135px_1fr] sm:grid-cols-[180px_1fr] items-end gap-3">
      <span className="text-[11px] font-black text-slate-500">{label}</span>
      <span className={`min-h-8 border-b border-slate-400 pb-1 ${strong ? 'text-lg font-black text-red-700' : 'font-bold'}`}>{value}</span>
    </div>
  );
}

function CheckBox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`w-5 h-5 border-2 rounded flex items-center justify-center ${checked ? 'border-red-700 text-red-700' : 'border-slate-400'}`}>
        {checked ? '✓' : ''}
      </span>
      {label}
    </span>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div className="text-center">
      <div className="border-t border-slate-500 pt-2 text-[11px] font-bold text-slate-500">{label}</div>
    </div>
  );
}
