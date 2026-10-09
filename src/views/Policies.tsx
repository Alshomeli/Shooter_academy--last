import { useEffect } from 'react';
import { ArrowRight, ShieldCheck, Mail, Phone, Instagram } from 'lucide-react';
import { policies, policyContact, policyHref } from '@/data/policies';
import { PolicyFooter } from '@/components/PolicyFooter';

export function Policies() {
  const requested = new URLSearchParams(window.location.search).get('section');
  const selected = policies.find(p => p.id === requested) || policies[0];
  useEffect(() => { document.title = `${selected.title} | Shooter Academy`; }, [selected.title]);
  return <div className="policy-page" lang="ar" dir="rtl">
    <a className="policy-skip" href="#policy-content">الانتقال إلى المحتوى</a>
    <header className="policy-top"><a className="policy-brand" href="/"><img src="/shooter-logo.svg" width="52" height="52" alt="" /><span>أكاديمية شوتر<small>SHOOTER ACADEMY</small></span></a><a href="/" className="policy-back"><ArrowRight size={18} /> العودة للبوابة</a></header>
    <div className="policy-intro"><ShieldCheck size={34} /><p>حقوقك وخصوصيتك تهمنا</p><h1>السياسات والمساعدة</h1><p>معلومات واضحة عن حسابك واشتراكك وسلامة أبنائك.</p></div>
    <p className="policy-draft" role="note">مسودة للمراجعة — إصدار 9 أكتوبر 2026. لا تصبح هذه الصياغة نافذة قبل استكمال بيانات الجهة ومراجعة إجراءاتها الفعلية واعتماد النشر.</p>
    <div className="policy-layout"><nav aria-label="اختر سياسة">{policies.map(p => <a key={p.id} href={policyHref(p.id)} aria-current={p.id === selected.id ? 'page' : undefined}>{p.title}<span aria-hidden="true">←</span></a>)}</nav>
      <main id="policy-content" tabIndex={-1}><h2>{selected.title}</h2>{selected.sections.map(([heading, content]) => <section key={heading}><h3>{heading}</h3><p>{content}</p></section>)}
        <aside className="policy-help"><h3>كيف نساعدك؟</h3><p>لطلب تصحيح البيانات أو حذفها أو سحب موافقة، تواصل مع الإدارة. لا يتم تنفيذ الحذف تلقائيًا بمجرد إرسال الطلب.</p><a href={`mailto:${policyContact.email}?subject=${encodeURIComponent('طلب بشأن ' + selected.title)}`}><Mail size={18} /><span dir="ltr">{policyContact.email}</span></a><a href={policyContact.phoneHref}><Phone size={18} /><span dir="ltr">{policyContact.phone}</span></a><a href={policyContact.instagram} target="_blank" rel="noopener noreferrer"><Instagram size={18} /><span dir="ltr">@shooter.academy.bh</span></a></aside>
      </main></div><PolicyFooter />
  </div>;
}
