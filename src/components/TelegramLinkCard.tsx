import { useState } from 'react';
import { Send, Copy, CheckCircle2 } from 'lucide-react';
import { db } from '@/lib/store';
import type { Lang } from '@/types';

export function TelegramLinkCard({ lang }: { lang: Lang }) {
  const isAr = lang === 'ar';
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setBusy(true); setError(''); setCopied(false);
    try { setCode(await db.createTelegramLinkCode()); }
    catch { setError(isAr ? 'تعذر إنشاء رمز الربط لهذا الحساب.' : 'Could not create a link code for this account.'); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(`/link ${code}`);
    setCopied(true);
  };

  return (
    <div className="rounded-2xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/20 p-4">
      <div className="flex items-start gap-3">
        <Send className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-black text-sm">{isAr ? 'ربط Telegram بالمنصة' : 'Connect Telegram'}</p>
          <p className="text-xs text-slate-500 mt-1">{isAr ? 'أنشئ رمزًا مؤقتًا ثم أرسله للبوت. الرمز صالح 10 دقائق ولمرة واحدة.' : 'Generate a temporary code and send it to the bot. It is valid for 10 minutes and one use.'}</p>
          {!code ? (
            <button disabled={busy} onClick={generate} className="mt-3 rounded-xl bg-sky-600 text-white px-4 py-2 text-xs font-bold disabled:opacity-50">
              {busy ? (isAr ? 'جارٍ الإنشاء...' : 'Generating...') : (isAr ? 'إنشاء رمز الربط' : 'Generate link code')}
            </button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <code className="rounded-xl bg-white dark:bg-slate-900 border px-3 py-2 font-black tracking-widest">/link {code}</code>
              <button onClick={copy} className="rounded-xl border px-3 py-2 text-xs font-bold flex items-center gap-1">
                {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? (isAr ? 'تم النسخ' : 'Copied') : (isAr ? 'نسخ' : 'Copy')}
              </button>
              <button onClick={generate} disabled={busy} className="text-xs underline text-slate-500">{isAr ? 'رمز جديد' : 'New code'}</button>
            </div>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}
