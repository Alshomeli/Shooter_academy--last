import { Printer } from 'lucide-react';
import type { Lang, Player, Subscription, Transaction } from '@/types';
import { paymentMethodLabel } from '@/lib/i18n';

type Props = {
  subscription: Subscription;
  transactions: Transaction[];
  players: Player[];
  lang: Lang;
  onClose: () => void;
};

export function PaymentReceipt({ subscription, transactions, players, lang, onClose }: Props) {
  const ar = lang === 'ar';
  const player = players.find((p) => p.id === subscription.playerId);
  const tx = transactions.find((t) => t.subscriptionId === subscription.id);
  const number = tx?.id ? tx.id.replace('txn-', '').slice(0, 12).toUpperCase() : subscription.id;
  const date = tx?.transactionDate || subscription.paidAt?.slice(0, 10) || '-';
  return (
    <div className="fixed inset-0 z-50 bg-black/50 p-4 overflow-y-auto" dir={ar ? 'rtl' : 'ltr'}>
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-xl">
        <div className="p-6 sm:p-8 text-slate-900">
          <div className="flex justify-between gap-4 pb-5 border-b-2 border-red-700">
            <div><div className="text-2xl font-black text-red-700">SHOOTER ACADEMY</div><div className="text-xs font-bold text-slate-500">{ar ? 'إيصال استلام' : 'RECEIPT'}</div></div>
            <div className="text-xs text-end"><div><b>{ar ? 'رقم الإيصال:' : 'Receipt No:'}</b> {number}</div><div><b>{ar ? 'التاريخ:' : 'Date:'}</b> {date}</div></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 py-5 text-sm">
            <Field label={ar ? 'استلمنا من' : 'Received from'} value={player?.parentName || player?.name || '-'} />
            <Field label={ar ? 'عن اللاعب' : 'For player'} value={player?.name || '-'} />
            <Field label={ar ? 'المبلغ' : 'Amount'} value={subscription.amount.toFixed(3) + ' BHD'} />
            <Field label={ar ? 'طريقة الدفع' : 'Payment method'} value={paymentMethodLabel(subscription.paymentMethod || 'cash', lang)} />
          </div>
          <div className="py-4 border-t text-xs text-slate-600"><b>{ar ? 'البيان:' : 'For:'}</b> {ar ? 'سداد اشتراك الأكاديمية' : 'Academy subscription payment'}<br/><b>{ar ? 'فترة الاشتراك:' : 'Subscription period:'}</b> {subscription.startDate} - {subscription.endDate}</div>
          <div className="grid grid-cols-2 gap-8 pt-12 text-xs text-center"><div className="border-t pt-2">{ar ? 'توقيع المستلم' : 'Receiver signature'}</div><div className="border-t pt-2">{ar ? 'توقيع الدافع' : 'Payer signature'}</div></div>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-slate-100 text-sm font-bold">{ar ? 'إغلاق' : 'Close'}</button>
          <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-700 text-white text-sm font-bold"><Printer className="h-4 w-4"/>{ar ? 'طباعة' : 'Print'}</button>
        </div>
      </div>
    </div>
  );
}
function Field({label,value}:{label:string;value:string}) { return <div className="p-3 rounded-xl bg-slate-50"><span className="block text-xs text-slate-500">{label}</span><strong>{value}</strong></div>; }
