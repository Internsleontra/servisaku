import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { variants, safeMotion } from '@/lib/design/motion';
import { ArrowRight, ArrowLeft, Shield, CheckCircle2, Eye, EyeOff, Check, Mail, Phone, User, Lock, KeyRound } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import { ROLE_HOME } from '@/lib/auth';
import { auditLog } from '@/lib/security';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { requestEmailOtp, verifyEmailOtp, createJWT } from '@/lib/appwriteAuth';
import { House, Wrench } from 'lucide-react';

const STEP = { ROLE: 'role', INPUT: 'input', OTP: 'otp', FORGOT: 'forgot', DONE: 'done' };
const METHOD = { PASSWORD: 'password', EMAIL_OTP: 'email-otp', PHONE_OTP: 'phone-otp' };

// Phone OTP country codes. Malaysia is the default (this is a MY app); the rest
// exist so the team can test with their own numbers. Trim for production.
const COUNTRIES = [
  { code: '+60', flag: '🇲🇾', name: 'Malaysia' },
  { code: '+91', flag: '🇮🇳', name: 'India' },
  { code: '+65', flag: '🇸🇬', name: 'Singapore' },
  { code: '+62', flag: '🇮🇩', name: 'Indonesia' },
  { code: '+63', flag: '🇵🇭', name: 'Philippines' },
  { code: '+66', flag: '🇹🇭', name: 'Thailand' },
  { code: '+1', flag: '🇺🇸', name: 'United States' },
  { code: '+44', flag: '🇬🇧', name: 'United Kingdom' },
];

const ALL_ROLES = {
  consumer: { id: 'consumer', label: 'Consumer', desc: 'Book home services', icon: House },
  partner: { id: 'partner', label: 'Service Partner', desc: 'Provide services & earn', icon: Wrench },
};

// Each build only signs people into the roles it actually serves. Admin lives
// in its own separate website, so the partner build no longer offers it.
const APP_TARGET = import.meta.env.VITE_APP === 'partner' ? 'partner' : 'consumer';
const APP_ROLES = APP_TARGET === 'partner'
  ? [ALL_ROLES.partner]
  : [ALL_ROLES.consumer];
// With a single role there's nothing to choose — skip straight to sign-in.
const SHOW_ROLE_STEP = APP_ROLES.length > 1;

export default function OTPLogin() {
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const [step, setStep] = useState(SHOW_ROLE_STEP ? STEP.ROLE : STEP.INPUT);
  const [method, setMethod] = useState(METHOD.PASSWORD);
  const [role, setRole] = useState(APP_ROLES[0].id);
  const [isRegister, setIsRegister] = useState(false);

  // Email / password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP fields
  const [dialCode, setDialCode] = useState('+60');
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpUserId, setOtpUserId] = useState(null);
  const [otpChannel, setOtpChannel] = useState('email'); // 'email' | 'phone'
  const [otpTarget, setOtpTarget] = useState('');        // display value / phone E.164
  const [countdown, setCountdown] = useState(0);
  const [devCode, setDevCode] = useState(null);          // shown when backend has no SMS provider

  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(null); // { devLink? } once a reset email is requested

  // Read live input values at submit so browser-autofilled credentials work.
  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const phoneRef = useRef(null);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  // ---- Email/Password login or register (Express-backed) ----
  const handleEmailAuth = async () => {
    const emailVal = (emailRef.current?.value ?? email).trim();
    const passwordVal = passwordRef.current?.value ?? password;
    if (emailVal !== email) setEmail(emailVal);
    if (passwordVal !== password) setPassword(passwordVal);
    if (!emailVal || !passwordVal) { toast.error('Please enter your email and password'); return; }
    if (isRegister && !fullName) { toast.error('Please enter your full name'); return; }
    setLoading(true);
    try {
      if (isRegister) {
        await servisaku.auth.register(emailVal, passwordVal, fullName);
        toast.success('Account created. Welcome to ServisAku.');
      } else {
        await servisaku.auth.loginViaEmailPassword(emailVal, passwordVal);
        toast.success('Logged in successfully!');
      }
      if (checkUserAuth) await checkUserAuth();
      auditLog('LOGIN_SUCCESS', { role, method: 'email' });
      setStep(STEP.DONE);
      setTimeout(() => navigate(ROLE_HOME[role] || '/'), 1200);
    } catch (err) {
      toast.error(err.message || 'Login failed. Please check your credentials.');
    }
    setLoading(false);
  };

  // ---- OTP: request a code (Appwrite email or phone) ----
  const sendOtp = async (channel) => {
    setLoading(true);
    try {
      if (channel === 'email') {
        const em = (emailRef.current?.value ?? email).trim();
        if (!em) { toast.error('Enter your email address'); setLoading(false); return; }
        const uid = await requestEmailOtp(em);
        setOtpUserId(uid); setOtpChannel('email'); setOtpTarget(em);
      } else {
        const raw = (phoneRef.current?.value ?? phone).replace(/\D/g, '');
        if (raw !== phone) setPhone(raw);
        if (raw.length < 8) { toast.error('Enter a valid mobile number'); setLoading(false); return; }
        const full = `${dialCode}${raw.replace(/^0/, '')}`;
        // Backend-native OTP (server's own Twilio) — bypasses Appwrite's phone limit.
        const res = await servisaku.auth.requestPhoneOtp(full);
        setDevCode(res?.dev_code || null);
        setOtpChannel('phone'); setOtpTarget(full);
      }
      setOtpCode('');
      setStep(STEP.OTP);
      setCountdown(60);
      toast.success('Verification code sent');
    } catch (err) {
      // Surface the real Appwrite reason — the common one for phone OTP is a
      // missing/disabled SMS provider in Appwrite Messaging.
      console.error('OTP send failed:', err);
      const msg = channel === 'phone' && /provider|sms|messaging/i.test(err?.message || '')
        ? 'SMS isn’t set up yet. Configure an SMS provider in Appwrite Messaging.'
        : err?.message || 'Could not send the code. Please try again.';
      toast.error(msg);
    }
    setLoading(false);
  };

  // ---- OTP: verify the code, then exchange the Appwrite session for our JWT ----
  const verifyOtpCode = async () => {
    if (otpCode.length < 6) { toast.error('Enter the 6-digit code'); return; }
    setLoading(true);
    try {
      if (otpChannel === 'phone') {
        // Backend-native phone OTP → Express session.
        await servisaku.auth.verifyPhoneOtp(otpTarget, otpCode, { fullName: fullName?.trim() || undefined });
      } else {
        // Appwrite email OTP → Appwrite session.
        if (!otpUserId) { toast.error('Please request a new code'); setLoading(false); return; }
        await verifyEmailOtp(otpUserId, otpCode);
        const { jwt } = await createJWT();
        await servisaku.auth.loginWithAppwrite(jwt, { role, fullName: fullName?.trim() || undefined });
      }
      if (checkUserAuth) await checkUserAuth();
      auditLog('LOGIN_SUCCESS', { role, method: `otp_${otpChannel}` });
      setStep(STEP.DONE);
      setTimeout(() => navigate(ROLE_HOME[role] || '/'), 1200);
    } catch (err) {
      toast.error(err.message || 'Verification failed. Please try again.');
    }
    setLoading(false);
  };

  // ---- Forgot password ----
  const handleForgotPassword = async () => {
    if (!email) { toast.error('Enter your email first'); return; }
    setLoading(true);
    try {
      const res = await servisaku.auth.forgotPassword(email);
      setResetSent({ devLink: res?.dev_reset_link || null });
      toast.success('If that email has an account, a reset link is on its way.');
    } catch (err) {
      toast.error(err.message || 'Could not send reset link');
    }
    setLoading(false);
  };

  const methodTabs = [
    { id: METHOD.PASSWORD, icon: Lock, label: 'Password' },
    { id: METHOD.EMAIL_OTP, icon: Mail, label: 'Email OTP' },
    { id: METHOD.PHONE_OTP, icon: Phone, label: 'Phone OTP' },
  ];

  return (
    <div className="min-h-screen bg-bg flex font-inter">
      {/* Left Side: Branding / Hero */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-grad-night p-12 lg:flex lg:w-[45%] xl:p-16">
        <div className="absolute inset-0 bg-grad-hero opacity-70"></div>
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-brand blur-[120px] opacity-20"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand blur-[100px] opacity-10"></div>

        <div className="relative z-10">
          {/* Official brand mark, not a generic house glyph. The mark is already
              a finished shape, so it is shown bare rather than boxed in a tile.
              White variant because this panel sits on the navy hero gradient. */}
          <Link to="/" className="inline-flex items-center gap-3 group" aria-label="ServisAku home">
            <img
              src="/img/brand/logo-mark-white.png"
              alt=""
              aria-hidden="true"
              className="h-11 w-11 shrink-0 object-contain transition-transform group-hover:scale-105"
            />
            <span className="font-brand text-3xl font-semibold tracking-tight text-white">Servis<span className="text-brand">Aku</span></span>
          </Link>
        </div>

        <div className="relative z-10 mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <h1 className="text-4xl xl:text-5xl font-display font-semibold text-white mb-6 leading-[1.15]">
              Trusted Home Services,<br/> <span className="text-brand">At Your Fingertips.</span>
            </h1>
            <p className="text-lg text-white/70 max-w-md mb-10 leading-relaxed">
              Book verified professionals for cleaning, repairs, maintenance, and home improvement across Malaysia.
            </p>
          </motion.div>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.4 }} className="flex flex-col sm:flex-row gap-6">
            <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-md">
               <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                 <Shield className="h-6 w-6 text-brand" />
               </div>
               <div>
                 <p className="text-sm font-semibold text-white">Verified pros</p>
                 <p className="text-xs text-white/60 mt-0.5">Vetted experts only</p>
               </div>
            </div>
            <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-md">
               <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                 <CheckCircle2 className="h-6 w-6 text-brand" />
               </div>
               <div>
                 <p className="text-sm font-semibold text-white">Quality work</p>
                 <p className="text-xs text-white/60 mt-0.5">Satisfaction guaranteed</p>
               </div>
            </div>
          </motion.div>
        </div>

        <div className="relative z-10 text-white/40 text-sm">
          &copy; {new Date().getFullYear()} ServisAku. All rights reserved.
        </div>
      </div>

      {/* Right Side: Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 relative bg-bg">
        <div className="lg:hidden absolute top-6 left-6 z-10">
          {/* Same lockup, compact. Colour mark here — this header sits on --bg. */}
          <Link to="/" className="inline-flex items-center gap-2" aria-label="ServisAku home">
            <img
              src="/img/brand/logo-mark.png"
              alt=""
              aria-hidden="true"
              className="h-9 w-9 shrink-0 object-contain"
            />
            <span className="font-brand text-2xl font-semibold tracking-tight text-ink">Servis<span className="text-brand">Aku</span></span>
          </Link>
        </div>

        <div className="w-full max-w-md mx-auto relative z-10 mt-16 lg:mt-0">
          <AnimatePresence mode="wait">
            <motion.div key={step} {...safeMotion(variants.slide)} className="w-full">

              {/* STEP 1: Role selection */}
              {step === STEP.ROLE && (
                <div>
                  <div className="mb-10 text-center lg:text-left">
                    <h2 className="text-3xl font-display font-semibold mb-2 text-ink">Welcome back</h2>
                    <p className="text-ink-secondary">Choose how you want to use ServisAku</p>
                  </div>
                  <div className="space-y-4 mb-8">
                    {APP_ROLES.map(r => (
                      <button key={r.id} onClick={() => setRole(r.id)}
                        className={`w-full flex items-center gap-5 p-5 rounded-2xl shadow-[inset_0_0_0_1px_rgb(var(--hairline))] transition-all ${role === r.id ? 'border-brand bg-brand-tint/20 shadow-sm' : 'border-hairline/20 bg-surface hover:border-hairline/60 hover:shadow-sm'}`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${role === r.id ? 'bg-brand/10' : 'bg-raised'}`}><r.icon className="size-6" /></div>
                        <div className="flex-1 text-left">
                          <p className={`font-semibold text-base ${role === r.id ? 'text-brand-ink' : 'text-ink'}`}>{r.label}</p>
                          <p className="text-sm text-ink-secondary mt-0.5">{r.desc}</p>
                        </div>
                        <div className={`ml-auto shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${role === r.id ? 'bg-brand border-brand' : 'shadow-[inset_0_0_0_1px_rgb(var(--hairline))]'}`}>
                          {role === r.id && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
                        </div>
                      </button>
                    ))}
                  </div>
                  <Button onClick={() => setStep(STEP.INPUT)} variant="primary" size="lg" className="w-full">
                    Continue <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </div>
              )}

              {/* STEP 2: Choose method + enter credentials */}
              {step === STEP.INPUT && (
                <div>
                  {SHOW_ROLE_STEP && (
                    <button onClick={() => setStep(STEP.ROLE)} className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary mb-8 hover:text-ink transition-colors">
                      <ArrowLeft className="h-4 w-4" /> Back to roles
                    </button>
                  )}

                  <div className="mb-6">
                    <h2 className="text-3xl font-display font-semibold mb-2 text-ink">
                      {isRegister ? 'Create an account' : 'Sign in to your account'}
                    </h2>
                    <p className="text-ink-secondary">
                      {isRegister ? 'Join thousands of users on ServisAku' : 'Choose how you want to sign in'}
                    </p>
                  </div>

                  {/* Method tabs */}
                  <div className="flex bg-raised rounded-xl p-1 mb-8">
                    {methodTabs.map(m => (
                      <button key={m.id} onClick={() => { setMethod(m.id); setIsRegister(false); }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all ${method === m.id ? 'bg-surface shadow-sm text-ink' : 'text-ink-secondary hover:text-ink'}`}>
                        <m.icon className="h-3.5 w-3.5" /> {m.label}
                      </button>
                    ))}
                  </div>

                  {/* Password method */}
                  {method === METHOD.PASSWORD && (
                    <div className="space-y-4">
                      {isRegister && (
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-ink pl-1">Full name</label>
                          <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                            <input type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)}
                              className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all" />
                          </div>
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Email address</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input ref={emailRef} type="email" placeholder="you@example.com" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all" autoFocus />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input ref={passwordRef} type={showPassword ? 'text' : 'password'} placeholder="••••••••" aria-label="Password" value={password} onChange={e => setPassword(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-12 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                            onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} />
                          <button onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink transition-colors">
                            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                      {!isRegister && (
                        <div className="text-right -mt-1">
                          <button type="button" onClick={() => { setResetSent(null); setStep(STEP.FORGOT); }} className="text-sm font-semibold text-brand hover:underline">
                            Forgot password?
                          </button>
                        </div>
                      )}
                      <Button onClick={handleEmailAuth} disabled={loading}
                        variant="primary" size="lg" className="w-full mt-4">
                        {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'} <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                      <div className="text-center pt-4">
                        <span className="text-sm text-ink-secondary">{isRegister ? "Already have an account?" : "Don't have an account?"}</span>
                        <button onClick={() => setIsRegister(!isRegister)} className="ml-2 text-sm font-semibold text-brand hover:underline">
                          {isRegister ? 'Sign in' : 'Sign up'}
                        </button>
                      </div>
                      {!isRegister && (
                        <div className="mt-8 bg-info-tint/50 border border-info/30 rounded-xl p-4 text-xs text-info">
                          <div className="font-semibold mb-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5"/>Demo credentials</div>
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                            {APP_TARGET === 'partner' ? (
                              <>
                                <div>Partner: <span className="font-medium text-info">ali@servisaku.my</span><br/>Pass: partner123</div>
                                <div>Admin: <span className="font-medium text-info">admin@servisaku.my</span><br/>Pass: admin123</div>
                              </>
                            ) : (
                              <div className="col-span-2">User: <span className="font-medium text-info">user@servisaku.my</span> / user123</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Email OTP method */}
                  {method === METHOD.EMAIL_OTP && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Email address</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input ref={emailRef} type="email" placeholder="you@example.com" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                            onKeyDown={e => e.key === 'Enter' && sendOtp('email')} autoFocus />
                        </div>
                      </div>
                      <div className="bg-brand-tint/30 rounded-xl p-4 text-sm text-brand-ink flex items-start gap-3">
                        <Shield className="h-5 w-5 text-brand shrink-0 mt-0.5" />
                        <p>We'll email you a 6-digit one-time code to sign in. No password needed.</p>
                      </div>
                      <Button onClick={() => sendOtp('email')} disabled={loading}
                        variant="primary" size="lg" className="w-full">
                        {loading ? 'Sending...' : 'Email me a code'} <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                    </div>
                  )}

                  {/* Phone OTP method */}
                  {method === METHOD.PHONE_OTP && (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Mobile Number</label>
                        <div className="flex gap-2">
                          <select value={dialCode} onChange={e => setDialCode(e.target.value)}
                            className="shrink-0 bg-raised rounded-xl px-3 py-3.5 text-sm font-medium outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink">
                            {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                          </select>
                          <input ref={phoneRef} type="tel" placeholder="11 234 5678" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                            className="flex-1 bg-raised rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                            maxLength={11} autoFocus onKeyDown={e => e.key === 'Enter' && sendOtp('phone')} />
                        </div>
                      </div>
                      <div className="bg-brand-tint/30 rounded-xl p-4 text-sm text-brand-ink flex items-start gap-3">
                        <Shield className="h-5 w-5 text-brand shrink-0 mt-0.5" />
                        <p>We'll text you a 6-digit one-time code via SMS to verify it's you.</p>
                      </div>
                      <Button onClick={() => sendOtp('phone')} disabled={loading}
                        variant="primary" size="lg" className="w-full">
                        {loading ? 'Sending...' : 'Text me a code'} <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP: OTP entry */}
              {step === STEP.OTP && (
                <div>
                  <button onClick={() => { setStep(STEP.INPUT); setOtpUserId(null); setOtpCode(''); setDevCode(null); }} className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary mb-8 hover:text-ink transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  <div className="mb-8">
                    <h2 className="text-3xl font-display font-semibold mb-2 text-ink">Enter verification code</h2>
                    <p className="text-ink-secondary">We've sent a 6-digit code to <span className="font-semibold text-ink">{otpTarget}</span></p>
                  </div>
                  {devCode && (
                    <div className="mb-6 rounded-xl border border-info/30 bg-info-tint/60 p-3 text-center text-xs text-info">
                      Dev mode (no SMS provider): your code is <span className="font-mono text-base font-semibold tracking-widest text-info">{devCode}</span>
                    </div>
                  )}
                  <div className="relative mb-6">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                    <input type="text" inputMode="numeric" placeholder="••••••" value={otpCode}
                      onChange={e => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-raised rounded-xl pl-12 pr-4 py-5 text-3xl tracking-[0.5em] text-center font-semibold outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                      maxLength={6} autoFocus onKeyDown={e => e.key === 'Enter' && verifyOtpCode()} />
                  </div>
                  <div className="text-center mb-8">
                    {countdown > 0
                      ? <p className="text-sm text-ink-secondary">Resend code in <span className="font-medium text-ink">{countdown}s</span></p>
                      : <button onClick={() => sendOtp(otpChannel)} disabled={loading} className="text-sm font-semibold text-brand hover:underline disabled:opacity-50">Resend code</button>}
                  </div>
                  <Button onClick={verifyOtpCode} disabled={otpCode.length < 6 || loading} variant="primary" size="lg" className="w-full">
                    {loading ? 'Verifying...' : 'Verify & Continue'} <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </div>
              )}

              {/* STEP: Forgot password */}
              {step === STEP.FORGOT && (
                <div>
                  <button onClick={() => { setStep(STEP.INPUT); setResetSent(null); }} className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary mb-8 hover:text-ink transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </button>
                  <div className="mb-8">
                    <h2 className="text-3xl font-display font-semibold mb-2 text-ink">Reset your password</h2>
                    <p className="text-ink-secondary">Enter your email and we'll send you a link to set a new password.</p>
                  </div>
                  {resetSent ? (
                    <div className="space-y-4">
                      <div className="bg-success-tint border border-success/30 rounded-xl p-4 text-sm text-success flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" />
                        <p>If an account exists for <span className="font-semibold">{email}</span>, a reset link has been sent. The link expires in 30 minutes.</p>
                      </div>
                      {resetSent.devLink && (
                        <div className="bg-info-tint/60 border border-info/30 rounded-xl p-4 text-xs text-info break-all">
                          <div className="font-semibold mb-1">Dev mode (SMTP not configured) — open this link:</div>
                          <a href={resetSent.devLink} className="underline font-medium">{resetSent.devLink}</a>
                        </div>
                      )}
                      <Button onClick={() => setStep(STEP.INPUT)} variant="primary" size="lg" className="w-full">Back to sign in</Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Email address</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input type="email" placeholder="you@example.com" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                            onKeyDown={e => e.key === 'Enter' && handleForgotPassword()} autoFocus />
                        </div>
                      </div>
                      <Button onClick={handleForgotPassword} disabled={loading || !email} variant="primary" size="lg" className="w-full">
                        {loading ? 'Sending...' : 'Send reset link'} <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP: Done */}
              {step === STEP.DONE && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="w-24 h-24 bg-success-tint rounded-full flex items-center justify-center mb-6">
                    <CheckCircle2 className="h-12 w-12 text-success" />
                  </motion.div>
                  <h2 className="text-2xl font-display font-semibold text-ink">Successfully Verified!</h2>
                  <p className="text-ink-secondary mt-2">Redirecting to your dashboard...</p>
                </div>
              )}

            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
