import { useState, type FormEvent } from 'react';
import {
  Mail, Lock, LogIn, AlertCircle, Loader2, ArrowRight, CheckCircle2,
  UserPlus, User, Phone, Briefcase, Dumbbell,
} from 'lucide-react';
import { db, signIn, signUp, setRegistering } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import type { CurrentUser, Lang, Role } from '@/types';
import { tr } from '@/lib/i18n';

interface LoginProps {
  onLogin: (user: CurrentUser) => void;
  lang: Lang;
  setLang: (l: Lang) => void;
}

const ROLE_LABELS: Record<Role, { ar: string; en: string }> = {
  manager: { ar: 'مدير النظام', en: 'System Manager' },
  accountant: { ar: 'المحاسب المالي', en: 'Accountant' },
  coach: { ar: 'الكابتن / المدرب', en: 'Coach / Captain' },
  receptionist: { ar: 'موظف الاستقبال', en: 'Receptionist' },
  parent: { ar: 'ولي الأمر', en: 'Parent' },
};

const REGISTER_ROLES: { id: Role; iconBg: string }[] = [
  { id: 'parent', iconBg: 'from-blue-500 to-blue-600' },
  { id: 'coach', iconBg: 'from-emerald-500 to-emerald-600' },
  { id: 'receptionist', iconBg: 'from-amber-500 to-amber-600' },
  { id: 'accountant', iconBg: 'from-teal-500 to-teal-600' },
];

type RegisterTab = 'staff' | 'player';

type Screen = 'login' | 'register' | 'forgot' | 'forgot-sent' | 'register-success';

export function Login({ onLogin, lang, setLang }: LoginProps) {
  const [screen, setScreen] = useState<Screen>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRole, setSelectedRole] = useState<Role>('parent');
  const [resetEmail, setResetEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registerTab, setRegisterTab] = useState<RegisterTab>('staff');
  const [playerName, setPlayerName] = useState('');
  const [playerBirthDate, setPlayerBirthDate] = useState('');
  const [playerPhone, setPlayerPhone] = useState('');
  const t = tr(lang);
  const isRtl = lang === 'ar';

  const clearError = () => setError('');

  /* ── Sign in ── */
  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!email) { setError(isRtl ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email'); return; }
    if (!password) { setError(isRtl ? 'يرجى إدخال كلمة المرور' : 'Please enter your password'); return; }

    setLoading(true);
    try {
      const { error: authError } = await signIn(email, password);
      if (authError) {
        setError(isRtl ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : 'Incorrect email or password');
        return;
      }
      const staff = await db.getStaff();
      const user = staff.find((s) => s.email.toLowerCase() === email.toLowerCase());
      if (!user) {
        // Never leave a signed-in session behind for an account the academy
        // does not recognise.
        await supabase.auth.signOut();
        setError(isRtl ? 'لم يتم العثور على حساب مرتبط بهذا البريد في النظام' : 'No staff account linked to this email');
        return;
      }
      if (user.status === 'pending') {
        await supabase.auth.signOut();
        setError(isRtl ? 'حسابك قيد المراجعة. يرجى الانتظار حتى يتم قبوله من قبل المدير.' : 'Your account is pending review. Please wait for manager approval.');
        return;
      }
      if (user.status === 'inactive') {
        await supabase.auth.signOut();
        setError(isRtl ? 'تم تعطيل حسابك. يرجى التواصل مع إدارة الأكاديمية.' : 'Your account has been deactivated. Please contact the academy.');
        return;
      }
      await db.addLoginAuditLog({
        id: `login-log-${Date.now()}`,
        action: isRtl ? 'تسجيل دخول ناجح' : 'Successful login',
        timestamp: new Date().toISOString(),
        userRole: user.role,
        userName: user.name,
        details: `تسجيل دخول ${user.name} بصلاحية ${ROLE_LABELS[user.role].ar}`,
      }).catch(() => {});
      onLogin({ id: user.id, name: user.name, email: user.email, role: user.role });
    } catch (err) {
      console.error('[login]', err);
      setError(isRtl ? 'حدث خطأ، يرجى المحاولة مرة أخرى' : 'An error occurred, please try again');
    } finally {
      setLoading(false);
    }
  };

  /* ── Sign up ── */
  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!fullName.trim()) { setError(isRtl ? 'يرجى إدخال الاسم الكامل' : 'Please enter your full name'); return; }
    if (!email) { setError(isRtl ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email'); return; }
    if (!password) { setError(isRtl ? 'يرجى إدخال كلمة المرور' : 'Please enter your password'); return; }
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError(isRtl
        ? 'كلمة المرور يجب أن تكون 10 أحرف على الأقل وتحتوي على حروف وأرقام'
        : 'Password must be at least 10 characters and include letters and numbers');
      return;
    }
    if (password !== confirmPassword) { setError(isRtl ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'); return; }

    setLoading(true);
    setRegistering(true);
    try {
      const { data: authData, error: authError } = await signUp(email, password);
      if (authError) {
        setRegistering(false);
        console.error('[signup]', authError);
        setError(isRtl
          ? 'تعذّر إنشاء الحساب. إذا كان لديك حساب بالفعل، فسجّل الدخول أو استخدم "نسيت كلمة المرور؟".'
          : 'Could not create the account. If you already have one, sign in or use "Forgot password?".');
        return;
      }

      if (!authData.user) {
        setError(isRtl ? 'حدث خطأ غير متوقع' : 'An unexpected error occurred');
        return;
      }

      const staffRecord = {
        id: authData.user.id,
        name: fullName.trim(),
        email: email.toLowerCase(),
        phone: phone.trim() || '-',
        role: selectedRole,
        salary: 0,
        specialization: ROLE_LABELS[selectedRole].ar,
        status: 'pending' as const,
        joinedDate: new Date().toISOString().split('T')[0],
        avatarUrl: '',
        userId: authData.user.id,
      };

      await db.saveStaff(staffRecord);

      await db.addLoginAuditLog({
        id: `reg-log-${Date.now()}`,
        action: isRtl ? 'تسجيل حساب جديد' : 'New account registered',
        timestamp: new Date().toISOString(),
        userRole: selectedRole,
        userName: fullName.trim(),
        details: `تسجيل حساب جديد: ${fullName.trim()} بصلاحية ${ROLE_LABELS[selectedRole].ar}`,
      }).catch(() => {});

      await supabase.auth.signOut();
      setRegistering(false);
      setScreen('register-success');
    } catch {
      setRegistering(false);
      setError(isRtl ? 'حدث خطأ، يرجى المحاولة مرة أخرى' : 'An error occurred, please try again');
    } finally {
      setLoading(false);
    }
  };

  /* ── Player registration ── */
  const handlePlayerRegister = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!fullName.trim()) { setError(isRtl ? 'يرجى إدخال اسم ولي الأمر' : 'Please enter parent name'); return; }
    if (!playerName.trim()) { setError(isRtl ? 'يرجى إدخال اسم اللاعب' : 'Please enter player name'); return; }
    if (!email) { setError(isRtl ? 'يرجى إدخال البريد الإلكتروني' : 'Please enter your email'); return; }
    if (!password) { setError(isRtl ? 'يرجى إدخال كلمة المرور' : 'Please enter your password'); return; }
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError(isRtl
        ? 'كلمة المرور يجب أن تكون 10 أحرف على الأقل وتحتوي على حروف وأرقام'
        : 'Password must be at least 10 characters and include letters and numbers');
      return;
    }
    if (password !== confirmPassword) { setError(isRtl ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'); return; }

    setLoading(true);
    setRegistering(true);
    try {
      const { data: authData, error: authError } = await signUp(email, password);
      if (authError) {
        setRegistering(false);
        console.error('[signup]', authError);
        setError(isRtl
          ? 'تعذّر إنشاء الحساب. إذا كان لديك حساب بالفعل، فسجّل الدخول أو استخدم "نسيت كلمة المرور؟".'
          : 'Could not create the account. If you already have one, sign in or use "Forgot password?".');
        return;
      }
      if (!authData.user) {
        setRegistering(false);
        setError(isRtl ? 'حدث خطأ غير متوقع' : 'An unexpected error occurred');
        return;
      }

      const staffRecord = {
        id: authData.user.id,
        name: fullName.trim(),
        email: email.toLowerCase(),
        phone: playerPhone.trim() || phone.trim() || '-',
        role: 'parent' as const,
        salary: 0,
        specialization: ROLE_LABELS['parent'].ar,
        status: 'pending' as const,
        joinedDate: new Date().toISOString().split('T')[0],
        avatarUrl: '',
        userId: authData.user.id,
      };
      await db.saveStaff(staffRecord);

      const playerRecord = {
        id: `player-${Date.now()}`,
        name: playerName.trim(),
        teamId: '',
        position: 'غير محدد',
        jerseyNumber: 0,
        birthDate: playerBirthDate || '2015-01-01',
        bloodType: '',
        parentName: fullName.trim(),
        parentPhone: playerPhone.trim() || phone.trim() || '-',
        parentEmail: email.toLowerCase(),
        parentId: '',
        status: 'inactive' as const,
        notes: '',
        joinedDate: new Date().toISOString().split('T')[0],
      };
      await db.savePlayer(playerRecord);

      await db.addLoginAuditLog({
        id: `reg-log-${Date.now()}`,
        action: isRtl ? 'تسجيل لاعب جديد' : 'New player registered',
        timestamp: new Date().toISOString(),
        userRole: 'parent' as const,
        userName: fullName.trim(),
        details: `تسجيل لاعب جديد: ${playerName.trim()} بواسطة ${fullName.trim()}`,
      }).catch(() => {});

      await supabase.auth.signOut();
      setRegistering(false);
      setScreen('register-success');
    } catch {
      setRegistering(false);
      setError(isRtl ? 'حدث خطأ، يرجى المحاولة مرة أخرى' : 'An error occurred, please try again');
    } finally {
      setLoading(false);
    }
  };

  /* ── Google sign in ── */
  const handleGoogleLogin = async () => {
    clearError();
    setLoading(true);
    try {
      const { error: oauthErr } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (oauthErr) {
        console.error('[oauth]', oauthErr);
        setError(isRtl ? 'تعذّر الاتصال بـ Google' : 'Could not connect to Google');
      }
    } catch {
      setError(isRtl ? 'تعذّر الاتصال بـ Google' : 'Could not connect to Google');
    } finally {
      setLoading(false);
    }
  };

  /* ── Forgot password ── */
  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!resetEmail) { setError(isRtl ? 'يرجى إدخال بريدك الإلكتروني' : 'Please enter your email'); return; }
    setLoading(true);
    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin,
      });
      if (resetErr) console.error('[reset]', resetErr);
      setScreen('forgot-sent');
    } catch {
      setError(isRtl ? 'حدث خطأ، يرجى المحاولة مرة أخرى' : 'An error occurred, please try again');
    } finally {
      setLoading(false);
    }
  };

  const switchTo = (s: Screen) => { setScreen(s); clearError(); };

  /* ─────────────────── Render ─────────────────── */
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950"
      dir={isRtl ? 'rtl' : 'ltr'}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-600/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-2xl shadow-emerald-900/50 mb-4 ring-4 ring-white/10">
            <img src="/copilot_image_1776165482483-300x300.png" alt="شعار أكاديمية شوتر" className="h-full w-full object-cover" />
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">أكاديمية شوتر</h1>
          <p className="text-sm text-slate-400 font-semibold mt-1">Shooter Academy · نظام الإدارة الشامل</p>
        </div>

        <div className="bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl">

          {/* ── TAB SWITCHER (login / register) ── */}
          {(screen === 'login' || screen === 'register') && (
            <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl mb-6">
              <button
                type="button"
                onClick={() => switchTo('login')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-black transition cursor-pointer ${screen === 'login' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <LogIn className="h-4 w-4" />
                {isRtl ? 'تسجيل الدخول' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => switchTo('register')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-black transition cursor-pointer ${screen === 'register' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                <UserPlus className="h-4 w-4" />
                {isRtl ? 'حساب جديد' : 'Register'}
              </button>
            </div>
          )}

          {/* ── LOGIN SCREEN ── */}
          {screen === 'login' && (
            <>
              {error && <ErrorBanner message={error} />}

              <form onSubmit={handleLogin} className="space-y-4">
                <InputField
                  label={t.email}
                  icon={<Mail className="h-4 w-4 text-slate-400" />}
                  type="email"
                  value={email}
                  placeholder="name@shooter.com"
                  onChange={(v) => { setEmail(v); clearError(); }}
                />
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-300">{t.password}</label>
                    <button
                      type="button"
                      onClick={() => { setResetEmail(email); switchTo('forgot'); }}
                      className="text-[11px] font-bold text-emerald-400 hover:text-emerald-300 transition cursor-pointer"
                    >
                      {isRtl ? 'نسيت كلمة المرور؟' : 'Forgot password?'}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearError(); }}
                      className="w-full bg-slate-900/60 text-white text-sm py-3 pr-10 pl-4 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition placeholder:text-slate-600"
                      placeholder="••••••••"
                      dir="ltr"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogIn className="h-5 w-5" />}
                  {t.signIn}
                </button>
              </form>

              <div className="flex items-center gap-3 my-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[11px] font-bold text-slate-500">{isRtl ? 'أو' : 'OR'}</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl border border-slate-700 bg-white/5 hover:bg-white/10 text-white text-sm font-bold transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <GoogleIcon />
                {isRtl ? 'تسجيل الدخول بـ Google' : 'Sign in with Google'}
              </button>
            </>
          )}

          {/* ── REGISTER SCREEN ── */}
          {screen === 'register' && (
            <>
              {error && <ErrorBanner message={error} />}

              {/* Sub-tab: staff vs player */}
              <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl mb-4">
                <button
                  type="button"
                  onClick={() => setRegisterTab('staff')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black transition cursor-pointer ${registerTab === 'staff' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Briefcase className="h-3.5 w-3.5" />
                  {isRtl ? 'حساب موظف/ولي أمر' : 'Staff / Parent'}
                </button>
                <button
                  type="button"
                  onClick={() => setRegisterTab('player')}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-black transition cursor-pointer ${registerTab === 'player' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
                >
                  <Dumbbell className="h-3.5 w-3.5" />
                  {isRtl ? 'تسجيل لاعب' : 'Register Player'}
                </button>
              </div>

              {registerTab === 'staff' ? (
              <form onSubmit={handleRegister} className="space-y-4">
                <InputField
                  label={isRtl ? 'الاسم الكامل' : 'Full Name'}
                  icon={<User className="h-4 w-4 text-slate-400" />}
                  type="text"
                  value={fullName}
                  placeholder={isRtl ? 'أدخل اسمك الكامل' : 'Enter your full name'}
                  onChange={(v) => { setFullName(v); clearError(); }}
                />

                <InputField
                  label={t.email}
                  icon={<Mail className="h-4 w-4 text-slate-400" />}
                  type="email"
                  value={email}
                  placeholder="name@shooter.com"
                  onChange={(v) => { setEmail(v); clearError(); }}
                />

                <InputField
                  label={isRtl ? 'رقم الهاتف (اختياري)' : 'Phone (optional)'}
                  icon={<Phone className="h-4 w-4 text-slate-400" />}
                  type="tel"
                  value={phone}
                  placeholder="05XXXXXXXX"
                  onChange={(v) => { setPhone(v); clearError(); }}
                />

                {/* Role selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">
                    <span className="flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5" />{isRtl ? 'نوع الحساب' : 'Account Type'}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {REGISTER_ROLES.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRole(r.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-right transition cursor-pointer ${
                          selectedRole === r.id
                            ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 shadow-md'
                            : 'border-slate-700 bg-white/5 hover:bg-white/10'
                        }`}
                      >
                        <div className={`shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${r.iconBg} flex items-center justify-center text-white`}>
                          <RoleIcon role={r.id} />
                        </div>
                        <span className={`text-xs font-bold truncate ${selectedRole === r.id ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {ROLE_LABELS[r.id][lang]}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <InputField
                  label={t.password}
                  icon={<Lock className="h-4 w-4 text-slate-400" />}
                  type="password"
                  value={password}
                  placeholder={isRtl ? '10 أحرف على الأقل مع أرقام' : 'At least 10 characters with numbers'}
                  onChange={(v) => { setPassword(v); clearError(); }}
                />

                <InputField
                  label={isRtl ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                  icon={<Lock className="h-4 w-4 text-slate-400" />}
                  type="password"
                  value={confirmPassword}
                  placeholder="••••••••"
                  onChange={(v) => { setConfirmPassword(v); clearError(); }}
                />

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
                  {isRtl ? 'إنشاء الحساب' : 'Create Account'}
                </button>
              </form>
              ) : (
              <form onSubmit={handlePlayerRegister} className="space-y-4">
                <InputField
                  label={isRtl ? 'اسم ولي الأمر' : 'Parent Name'}
                  icon={<User className="h-4 w-4 text-slate-400" />}
                  type="text"
                  value={fullName}
                  placeholder={isRtl ? 'اسم ولي الأمر الكامل' : 'Enter parent full name'}
                  onChange={(v) => { setFullName(v); clearError(); }}
                />
                <InputField
                  label={isRtl ? 'اسم اللاعب' : 'Player Name'}
                  icon={<Dumbbell className="h-4 w-4 text-slate-400" />}
                  type="text"
                  value={playerName}
                  placeholder={isRtl ? 'اسم اللاعب الكامل' : 'Enter player full name'}
                  onChange={(v) => { setPlayerName(v); clearError(); }}
                />
                <InputField
                  label={t.email}
                  icon={<Mail className="h-4 w-4 text-slate-400" />}
                  type="email"
                  value={email}
                  placeholder="name@shooter.com"
                  onChange={(v) => { setEmail(v); clearError(); }}
                />
                <InputField
                  label={isRtl ? 'رقم الهاتف' : 'Phone Number'}
                  icon={<Phone className="h-4 w-4 text-slate-400" />}
                  type="tel"
                  value={playerPhone}
                  placeholder="05XXXXXXXX"
                  onChange={(v) => { setPlayerPhone(v); clearError(); }}
                />
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">{isRtl ? 'تاريخ ميلاد اللاعب' : 'Player Birth Date'}</label>
                  <div className="relative">
                    <input
                      type="date"
                      value={playerBirthDate}
                      onChange={(e) => { setPlayerBirthDate(e.target.value); clearError(); }}
                      className="w-full bg-slate-900/60 text-white text-sm py-3 px-4 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition"
                      dir="ltr"
                    />
                  </div>
                </div>
                <InputField
                  label={t.password}
                  icon={<Lock className="h-4 w-4 text-slate-400" />}
                  type="password"
                  value={password}
                  placeholder={isRtl ? '10 أحرف على الأقل مع أرقام' : 'At least 10 characters with numbers'}
                  onChange={(v) => { setPassword(v); clearError(); }}
                />
                <InputField
                  label={isRtl ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                  icon={<Lock className="h-4 w-4 text-slate-400" />}
                  type="password"
                  value={confirmPassword}
                  placeholder="••••••••"
                  onChange={(v) => { setConfirmPassword(v); clearError(); }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <UserPlus className="h-5 w-5" />}
                  {isRtl ? 'تسجيل اللاعب' : 'Register Player'}
                </button>
              </form>
              )}
            </>
          )}

          {/* ── FORGOT PASSWORD ── */}
          {screen === 'forgot' && (
            <>
              <button
                onClick={() => switchTo('login')}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-white mb-5 transition cursor-pointer"
              >
                <ArrowRight className={`h-4 w-4 ${isRtl ? '' : 'rotate-180'}`} />
                {isRtl ? 'العودة لتسجيل الدخول' : 'Back to login'}
              </button>

              <div className="mb-6">
                <h2 className="text-base font-black text-white mb-1">
                  {isRtl ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}
                </h2>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {isRtl
                    ? 'أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.'
                    : 'Enter your email and we will send you a password reset link.'}
                </p>
              </div>

              {error && <ErrorBanner message={error} />}

              <form onSubmit={handleForgotPassword} className="space-y-4">
                <InputField
                  label={t.email}
                  icon={<Mail className="h-4 w-4 text-slate-400" />}
                  type="email"
                  value={resetEmail}
                  placeholder="name@shooter.com"
                  onChange={(v) => { setResetEmail(v); clearError(); }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black py-3 rounded-xl shadow-lg shadow-emerald-900/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                  {isRtl ? 'إرسال رابط الاستعادة' : 'Send Reset Link'}
                </button>
              </form>
            </>
          )}

          {/* ── FORGOT SENT ── */}
          {screen === 'forgot-sent' && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 mb-4">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-base font-black text-white mb-2">
                {isRtl ? 'تم الإرسال!' : 'Email Sent!'}
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed mb-6">
                {isRtl
                  ? `تم إرسال رابط استعادة كلمة المرور إلى ${resetEmail}. تحقق من بريدك الوارد.`
                  : `A password reset link has been sent to ${resetEmail}. Check your inbox.`}
              </p>
              <button
                onClick={() => switchTo('login')}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-black py-3 rounded-xl transition cursor-pointer"
              >
                {isRtl ? 'العودة لتسجيل الدخول' : 'Back to Login'}
              </button>
            </div>
          )}

          {/* ── REGISTER SUCCESS ── */}
          {screen === 'register-success' && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-500/20 text-emerald-400 mb-4">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h2 className="text-base font-black text-white mb-2">
                {isRtl ? 'تم إنشاء الحساب بنجاح!' : 'Account Created!'}
              </h2>
              <p className="text-sm text-slate-400 leading-relaxed mb-2">
                {isRtl
                  ? 'حسابك قيد المراجعة من قبل إدارة الأكاديمية.'
                  : 'Your account is pending review by the academy management.'}
              </p>
              <p className="text-xs text-slate-500 leading-relaxed mb-6">
                {isRtl
                  ? 'ستتمكن من تسجيل الدخول بعد موافقة المدير على حسابك.'
                  : 'You will be able to sign in once your account is approved by a manager.'}
              </p>
              <button
                onClick={() => switchTo('login')}
                className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 text-white font-black py-3 rounded-xl transition cursor-pointer"
              >
                {isRtl ? 'العودة لتسجيل الدخول' : 'Back to Sign In'}
              </button>
            </div>
          )}
        </div>

        {/* Language toggle */}
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')}
            className="text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer px-3 py-1.5 rounded-lg border border-slate-700/50 hover:border-slate-600"
          >
            {lang === 'ar' ? 'English' : 'العربية'}
          </button>
          <span className="text-[10px] text-slate-600">&copy; 2026 Shooter Academy</span>
        </div>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm font-semibold animate-fadeIn">
      <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

function InputField({
  label, icon, type, value, placeholder, onChange,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <span className="absolute right-3 top-1/2 -translate-y-1/2">{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-slate-900/60 text-white text-sm py-3 pr-10 pl-4 rounded-xl border border-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition placeholder:text-slate-600"
          placeholder={placeholder}
          dir={type === 'email' || type === 'tel' || type === 'password' ? 'ltr' : undefined}
        />
      </div>
    </div>
  );
}

function RoleIcon({ role }: { role: Role }) {
  const cls = 'h-4 w-4';
  switch (role) {
    case 'parent': return <User className={cls} />;
    case 'coach': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 4.24 4.24" /><path d="m14.83 9.17 4.24-4.24" /><path d="m14.83 14.83 4.24 4.24" /><path d="m9.17 14.83-4.24 4.24" /><circle cx="12" cy="12" r="4" /></svg>;
    case 'receptionist': return <Phone className={cls} />;
    case 'accountant': return <Briefcase className={cls} />;
    case 'manager': return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5Z" /><path d="m2 17 10 5 10-5" /><path d="m2 12 10 5 10-5" /></svg>;
  }
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9086c1.7018-1.5668 2.6836-3.874 2.6836-6.615z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.4673-.8059 5.9564-2.1805l-2.9086-2.2581c-.8059.54-1.8368.859-3.0477.859-2.3445 0-4.3282-1.5832-5.036-3.7105H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
      <path d="M3.964 10.71c-.18-.54-.2827-1.1168-.2827-1.71s.1018-1.17.2827-1.71V4.9582H.9574C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z" fill="#FBBC05" />
      <path d="M9 3.5795c1.3214 0 2.5077.4545 3.4405 1.346l2.5813-2.5814C13.4627.8918 11.4255 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6554 3.5795 9 3.5795z" fill="#EA4335" />
    </svg>
  );
}
