import { policies, policyHref, policyContact } from '@/data/policies';

export function PolicyFooter() {
  return <footer className="policy-footer" dir="rtl" lang="ar">
    <div className="policy-footer-inner">
      <a href="/policies" className="policy-brand"><img src="/shooter-logo.svg" alt="" width="46" height="46" /><span>أكاديمية شوتر<small>السياسات والمساعدة</small></span></a>
      <nav aria-label="السياسات والمساعدة">{policies.map(p => <a key={p.id} href={policyHref(p.id)}>{p.title}</a>)}</nav>
      <div className="policy-footer-contact"><a href={`mailto:${policyContact.email}`}>{policyContact.email}</a><a href={policyContact.phoneHref} dir="ltr">{policyContact.phone}</a><small>© {new Date().getFullYear()} Shooter Academy</small></div>
    </div>
  </footer>;
}
