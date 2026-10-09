import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Policies } from './views/Policies';
import { PolicyFooter } from './components/PolicyFooter';
import './index.css';
import './policies.css';

const oauthConsent = window.location.pathname === '/oauth/consent';
const policies = window.location.pathname.replace(/\/+$/, '') === '/policies';
// Public policy pages must also load when authentication configuration is unavailable.
const App = lazy(() => import('./App.tsx'));
const OAuthConsent = lazy(() => import('./views/OAuthConsent.tsx').then(m => ({ default: m.OAuthConsent })));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<p role="status" className="p-8 text-center">جارٍ التحميل…</p>}>
      {policies ? <Policies /> : oauthConsent ? <OAuthConsent /> : <><App /><PolicyFooter /></>}
    </Suspense>
  </StrictMode>
);
