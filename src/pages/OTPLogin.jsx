import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { variants, safeMotion } from '@/lib/design/motion';
import { ArrowRight, ArrowLeft, Shield, CheckCircle2, Eye, EyeOff, Check, Mail, Phone, User, Home, Lock } from 'lucide-react';
import { servisaku } from '@/api/servisakuClient';
import {
  formatMalaysianPhone, isValidMalaysianPhone,
  ROLE_HOME
} from '@/lib/auth';
import { checkOtpSendAllowed, sanitizePhone, auditLog } from '@/lib/security';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  auth,
  RecaptchaVerifier,
  signInWithPhoneNumber,
  GoogleAuthProvider,
  signInWithPopup,
} from '@/lib/firebase';

const STEP = { ROLE: 'role', INPUT: 'input', OTP: 'otp', FORGOT: 'forgot', DONE: 'done' };
const MODE = { EMAIL: 'email', PHONE: 'phone' };

const ALL_ROLES = {
  consumer: { id: 'consumer', label: 'Consumer', desc: 'Book home services', emoji: '🏠' },
  partner: { id: 'partner', label: 'Service Partner', desc: 'Provide services & earn', emoji: '🔧' },
  admin: { id: 'admin', label: 'Admin', desc: 'Manage the platform', emoji: '⚙️' },
};

// Each build only signs people into the roles it actually serves.
const APP_TARGET = import.meta.env.VITE_APP === 'partner' ? 'partner' : 'consumer';
const APP_ROLES = APP_TARGET === 'partner'
  ? [ALL_ROLES.partner, ALL_ROLES.admin]
  : [ALL_ROLES.consumer];
// With a single role there's nothing to choose — skip straight to sign-in.
const SHOW_ROLE_STEP = APP_ROLES.length > 1;

export default function OTPLogin() {
  const navigate = useNavigate();
  const { checkUserAuth } = useAuth();
  const [step, setStep] = useState(SHOW_ROLE_STEP ? STEP.ROLE : STEP.INPUT);
  const [mode, setMode] = useState(MODE.EMAIL);
  const [role, setRole] = useState(APP_ROLES[0].id);
  const [isRegister, setIsRegister] = useState(false);

  // Email/password fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // OTP/phone fields
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [resetSent, setResetSent] = useState(null); // { devLink? } once a reset email is requested

  // Firebase Phone Auth state
  const [confirmationResult, setConfirmationResult] = useState(null);
  const recaptchaContainerRef = useRef(null);
  const recaptchaVerifierRef = useRef(null);

  // Set up invisible reCAPTCHA once on mount
  useEffect(() => {
    return () => {
      // Cleanup recaptcha on unmount
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch {}
        recaptchaVerifierRef.current = null;
      }
    };
  }, []);

  function setupRecaptcha() {
    if (recaptchaVerifierRef.current) return;
    recaptchaVerifierRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        // reCAPTCHA solved — continue with phone auth
      },
      'expired-callback': () => {
        toast.error('reCAPTCHA expired. Please try again.');
        recaptchaVerifierRef.current = null;
      },
    });
  }

  const startCountdown = () => {
    setCountdown(60);
    const t = setInterval(() => {
      setCountdown(c => { if (c <= 1) { clearInterval(t); return 0; } return c - 1; });
    }, 1000);
  };

  // ---- Email/Password login or register ----
  const handleEmailAuth = async () => {
    if (!email || !password) { toast.error('Please enter your email and password'); return; }
    if (isRegister && !fullName) { toast.error('Please enter your full name'); return; }
    setLoading(true);
    try {
      if (isRegister) {
        await servisaku.auth.register(email, password, fullName);
        toast.success('Account created! Welcome to ServisAku 🎉');
      } else {
        await servisaku.auth.loginViaEmailPassword(email, password);
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

  // ---- Real Firebase Phone OTP flow ----
  const handleSendOTP = async () => {
    const cleaned = sanitizePhone(phone);
    const formatted = formatMalaysianPhone(cleaned);
    if (!isValidMalaysianPhone(formatted)) {
      toast.error('Please enter a valid Malaysian mobile number');
      return;
    }
    const rateCheck = checkOtpSendAllowed(formatted);
    if (!rateCheck.allowed) { toast.error(rateCheck.message); return; }

    setLoading(true);
    try {
      setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, formatted, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      setStep(STEP.OTP);
      startCountdown();
      toast.success('OTP sent to your phone!');
    } catch (err) {
      console.error('Firebase Phone Auth Error:', err);
      // Reset recaptcha on failure so user can retry
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch {}
        recaptchaVerifierRef.current = null;
      }
      if (err.code === 'auth/invalid-phone-number') {
        toast.error('Invalid phone number format. Please check and try again.');
      } else if (err.code === 'auth/too-many-requests') {
        toast.error('Too many requests. Please wait a few minutes and try again.');
      } else if (err.code === 'auth/quota-exceeded') {
        toast.error('SMS quota exceeded. Please try again later.');
      } else {
        toast.error(err.message || 'Failed to send OTP. Please try again.');
      }
    }
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!otp || otp.length < 6) { toast.error('Please enter the 6-digit code'); return; }
    if (!confirmationResult) { toast.error('Please request a new OTP first'); return; }

    setLoading(true);
    try {
      const userCredential = await confirmationResult.confirm(otp);
      const firebaseIdToken = await userCredential.user.getIdToken();

      // Send the Firebase token to our backend to get our internal JWT.
      // Pass the name so a brand-new phone signup gets a proper display name.
      await servisaku.auth.loginWithFirebase(firebaseIdToken, fullName?.trim() || undefined);
      if (checkUserAuth) await checkUserAuth();
      auditLog('LOGIN_SUCCESS', { role, method: 'otp_firebase' });
      setStep(STEP.DONE);
      setTimeout(() => navigate(ROLE_HOME[role] || '/'), 1200);
    } catch (err) {
      console.error('OTP Verify Error:', err);
      if (err.code === 'auth/invalid-verification-code') {
        toast.error('Incorrect OTP code. Please try again.');
      } else if (err.code === 'auth/code-expired') {
        toast.error('OTP has expired. Please request a new one.');
      } else {
        toast.error(err.message || 'Verification failed. Please try again.');
      }
    }
    setLoading(false);
  };

  const handleResend = async () => {
    const formatted = formatMalaysianPhone(sanitizePhone(phone));
    const rateCheck = checkOtpSendAllowed(formatted);
    if (!rateCheck.allowed) { toast.error(rateCheck.message); return; }

    setLoading(true);
    try {
      // Clear old recaptcha for a fresh one
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch {}
        recaptchaVerifierRef.current = null;
      }
      setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, formatted, recaptchaVerifierRef.current);
      setConfirmationResult(result);
      startCountdown();
      toast.success('New OTP sent!');
    } catch (err) {
      if (recaptchaVerifierRef.current) {
        try { recaptchaVerifierRef.current.clear(); } catch {}
        recaptchaVerifierRef.current = null;
      }
      toast.error(err.message || 'Failed to resend OTP.');
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

  // ---- Google Sign-In ----
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const firebaseIdToken = await result.user.getIdToken();

      await servisaku.auth.loginWithFirebase(firebaseIdToken);
      if (checkUserAuth) await checkUserAuth();
      auditLog('LOGIN_SUCCESS', { role, method: 'google_firebase' });
      setStep(STEP.DONE);
      setTimeout(() => navigate(ROLE_HOME[role] || '/'), 1200);
    } catch (err) {
      console.error('Google Sign-In Error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        // User closed the popup, not an error
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Multiple popups, ignore
      } else {
        toast.error(err.message || 'Google sign-in failed. Please try again.');
      }
    }
    setGoogleLoading(false);
  };

  return (
    <div className="min-h-screen bg-bg flex font-inter">
      {/* Invisible reCAPTCHA container */}
      <div id="recaptcha-container" ref={recaptchaContainerRef}></div>

      {/* Left Side: Branding / Hero */}
      <div className="hidden lg:flex lg:w-[45%] bg-[#031024] relative overflow-hidden flex-col justify-between p-12 xl:p-16">
        {/* Abstract Background Elements */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-[#031024] via-[#051c3f] to-[#031024]"></div>
        
        {/* Glowing orb for modern look */}
        <div className="absolute -top-[20%] -right-[10%] w-[50%] h-[50%] rounded-full bg-brand blur-[120px] opacity-20"></div>
        <div className="absolute -bottom-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-brand blur-[100px] opacity-10"></div>

        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <div className="bg-brand text-white p-2.5 rounded-xl shadow-lg shadow-brand/20 group-hover:scale-105 transition-transform">
               <Home className="h-6 w-6" />
            </div>
            <span className="text-3xl font-display font-bold text-white tracking-tight">Servis<span className="text-brand">Aku</span></span>
          </Link>
        </div>

        <div className="relative z-10 mb-12">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}>
            <h1 className="text-4xl xl:text-5xl font-display font-bold text-white mb-6 leading-[1.15]">
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
                 <p className="text-sm font-semibold text-white">Verified Pros</p>
                 <p className="text-xs text-white/60 mt-0.5">Vetted experts only</p>
               </div>
            </div>
            <div className="flex items-center gap-4 bg-white/5 rounded-2xl p-4 border border-white/10 backdrop-blur-md">
               <div className="w-12 h-12 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                 <CheckCircle2 className="h-6 w-6 text-brand" />
               </div>
               <div>
                 <p className="text-sm font-semibold text-white">Quality Work</p>
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
        {/* Mobile Logo */}
        <div className="lg:hidden absolute top-6 left-6 z-10">
          <Link to="/" className="inline-flex items-center gap-2">
            <div className="bg-brand text-white p-2 rounded-lg shadow-sm">
               <Home className="h-5 w-5" />
            </div>
            <span className="text-2xl font-display font-bold text-ink tracking-tight">Servis<span className="text-brand">Aku</span></span>
          </Link>
        </div>

        <div className="w-full max-w-md mx-auto relative z-10 mt-16 lg:mt-0">
          <AnimatePresence mode="wait">
            <motion.div key={step} {...safeMotion(variants.slide)} className="w-full">

              {/* STEP 1: Role selection */}
              {step === STEP.ROLE && (
                <div>
                  <div className="mb-10 text-center lg:text-left">
                    <h2 className="text-3xl font-display font-bold mb-2 text-ink">Welcome back 👋</h2>
                    <p className="text-ink-secondary">Choose how you want to use ServisAku</p>
                  </div>
                  
                  <div className="space-y-4 mb-8">
                    {APP_ROLES.map(r => (
                      <button key={r.id} onClick={() => setRole(r.id)}
                        className={`w-full flex items-center gap-5 p-5 rounded-2xl border-2 transition-all ${role === r.id ? 'border-brand bg-brand-tint/20 shadow-sm' : 'border-hairline/20 bg-surface hover:border-hairline/60 hover:shadow-sm'}`}>
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${role === r.id ? 'bg-brand/10' : 'bg-raised'}`}>
                          {r.emoji}
                        </div>
                        <div className="flex-1 text-left">
                          <p className={`font-semibold text-base ${role === r.id ? 'text-brand-ink' : 'text-ink'}`}>{r.label}</p>
                          <p className="text-sm text-ink-secondary mt-0.5">{r.desc}</p>
                        </div>
                        <div className={`ml-auto shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors ${role === r.id ? 'bg-brand border-brand' : 'border-2 border-hairline/30'}`}>
                          {role === r.id && <Check className="h-3.5 w-3.5 text-white stroke-[3]" />}
                        </div>
                      </button>
                    ))}
                  </div>
                  
                  <Button onClick={() => setStep(STEP.INPUT)} className="w-full h-14 rounded-2xl bg-[#031024] text-white hover:bg-[#031024]/90 shadow-xl shadow-[#031024]/10 font-semibold text-lg">
                    Continue <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </div>
              )}

              {/* STEP 2: Login method */}
              {step === STEP.INPUT && (
                <div>
                  {SHOW_ROLE_STEP && (
                    <button onClick={() => setStep(STEP.ROLE)} className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary mb-8 hover:text-ink transition-colors">
                      <ArrowLeft className="h-4 w-4" /> Back to roles
                    </button>
                  )}

                  <div className="mb-8">
                    <h2 className="text-3xl font-display font-bold mb-2 text-ink">
                      {isRegister ? 'Create an account' : 'Sign in to your account'}
                    </h2>
                    <p className="text-ink-secondary">
                      {isRegister ? 'Join thousands of users on ServisAku' : 'Enter your details below to continue'}
                    </p>
                  </div>

                  {/* Google Sign-In Button */}
                  <button
                    onClick={handleGoogleLogin}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-3 h-14 rounded-xl border-2 border-hairline/30 bg-surface hover:bg-raised hover:border-hairline/60 transition-all mb-6 font-semibold text-sm text-ink disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {googleLoading ? (
                      <div className="h-5 w-5 border-2 border-ink/30 border-t-ink rounded-full animate-spin" />
                    ) : (
                      <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                    )}
                    {googleLoading ? 'Signing in...' : 'Continue with Google'}
                  </button>

                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex-1 h-px bg-hairline/30"></div>
                    <span className="text-xs font-medium text-ink-secondary uppercase tracking-wide">or</span>
                    <div className="flex-1 h-px bg-hairline/30"></div>
                  </div>

                  {/* Mode tabs */}
                  <div className="flex bg-raised rounded-xl p-1 mb-8">
                    {[{ id: MODE.EMAIL, icon: Mail, label: 'Email' }, { id: MODE.PHONE, icon: Phone, label: 'Phone OTP' }].map(m => (
                      <button key={m.id} onClick={() => { setMode(m.id); setIsRegister(false); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-lg text-sm font-semibold transition-all ${mode === m.id ? 'bg-surface shadow-sm text-ink' : 'text-ink-secondary hover:text-ink'}`}>
                        <m.icon className="h-4 w-4" /> {m.label}
                      </button>
                    ))}
                  </div>

                  {mode === MODE.EMAIL ? (
                    <div className="space-y-4">
                      {isRegister && (
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-ink pl-1">Full Name</label>
                          <div className="relative">
                            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                            <input type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)}
                              className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all" />
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all" autoFocus />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Password</label>
                        <div className="relative">
                          <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input type={showPassword ? 'text' : 'password'} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-12 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                            onKeyDown={e => e.key === 'Enter' && handleEmailAuth()} />
                          <button onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink transition-colors">
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

                      <Button onClick={handleEmailAuth} disabled={loading || !email || !password || (isRegister && !fullName)}
                        className="w-full h-14 rounded-xl bg-brand text-white hover:bg-brand/90 mt-4 shadow-lg shadow-brand/20 font-semibold text-base transition-all">
                        {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'} <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                      
                      <div className="text-center pt-4">
                        <span className="text-sm text-ink-secondary">
                          {isRegister ? "Already have an account?" : "Don't have an account?"}
                        </span>
                        <button onClick={() => setIsRegister(!isRegister)} className="ml-2 text-sm font-semibold text-brand hover:underline">
                          {isRegister ? 'Sign in' : 'Sign up'}
                        </button>
                      </div>

                      {/* Demo hint */}
                      {!isRegister && (
                        <div className="mt-8 bg-blue-50/50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800">
                          <div className="font-semibold mb-2 flex items-center gap-1.5"><Shield className="h-3.5 w-3.5"/>Demo Credentials</div>
                          <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
                            {APP_TARGET === 'partner' ? (
                              <>
                                <div>Partner: <span className="font-medium text-blue-900">ali@servisaku.my</span><br/>Pass: partner123</div>
                                <div>Admin: <span className="font-medium text-blue-900">admin@servisaku.my</span><br/>Pass: admin123</div>
                              </>
                            ) : (
                              <div className="col-span-2">User: <span className="font-medium text-blue-900">user@servisaku.my</span> / user123</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Full Name <span className="text-ink-tertiary font-normal">(for new accounts)</span></label>
                        <div className="relative">
                          <User className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Mobile Number</label>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-2 bg-raised rounded-xl px-4 py-3.5 text-sm font-medium shrink-0 border border-transparent">
                            🇲🇾 +60
                          </div>
                          <input type="tel" placeholder="11 234 5678" value={phone}
                            onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                            className="flex-1 bg-raised rounded-xl px-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                            maxLength={11} autoFocus />
                        </div>
                      </div>
                      
                      <div className="bg-brand-tint/30 rounded-xl p-4 mt-6 text-sm text-brand-ink flex items-start gap-3">
                        <Shield className="h-5 w-5 text-brand shrink-0 mt-0.5" />
                        <p>Your number is used for secure login only. We'll send you a real One-Time Password (OTP) via SMS to verify it's you.</p>
                      </div>
                      
                      <Button onClick={handleSendOTP} disabled={phone.length < 8 || loading} className="w-full h-14 rounded-xl bg-brand text-white hover:bg-brand/90 mt-4 shadow-lg shadow-brand/20 font-semibold text-base transition-all">
                        {loading ? 'Sending...' : 'Send OTP'} <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP: Forgot password */}
              {step === STEP.FORGOT && (
                <div>
                  <button onClick={() => { setStep(STEP.INPUT); setResetSent(null); }} className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary mb-8 hover:text-ink transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </button>

                  <div className="mb-8">
                    <h2 className="text-3xl font-display font-bold mb-2 text-ink">Reset your password</h2>
                    <p className="text-ink-secondary">Enter your email and we'll send you a link to set a new password.</p>
                  </div>

                  {resetSent ? (
                    <div className="space-y-4">
                      <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-sm text-green-800 flex items-start gap-3">
                        <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
                        <p>If an account exists for <span className="font-semibold">{email}</span>, a reset link has been sent. The link expires in 30 minutes.</p>
                      </div>
                      {resetSent.devLink && (
                        <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-4 text-xs text-blue-800 break-all">
                          <div className="font-semibold mb-1">Dev mode (SMTP not configured) — open this link:</div>
                          <a href={resetSent.devLink} className="underline font-medium">{resetSent.devLink}</a>
                        </div>
                      )}
                      <Button onClick={() => setStep(STEP.INPUT)} className="w-full h-14 rounded-xl bg-brand text-white hover:bg-brand/90 font-semibold text-base">
                        Back to sign in
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-ink pl-1">Email Address</label>
                        <div className="relative">
                          <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-ink-tertiary" />
                          <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)}
                            className="w-full bg-raised rounded-xl pl-12 pr-4 py-3.5 text-sm outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                            onKeyDown={e => e.key === 'Enter' && handleForgotPassword()} autoFocus />
                        </div>
                      </div>
                      <Button onClick={handleForgotPassword} disabled={loading || !email} className="w-full h-14 rounded-xl bg-brand text-white hover:bg-brand/90 shadow-lg shadow-brand/20 font-semibold text-base transition-all">
                        {loading ? 'Sending...' : 'Send reset link'} <ArrowRight className="h-5 w-5 ml-2" />
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 3: OTP entry */}
              {step === STEP.OTP && (
                <div>
                  <button onClick={() => { setStep(STEP.INPUT); setConfirmationResult(null); }} className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary mb-8 hover:text-ink transition-colors">
                    <ArrowLeft className="h-4 w-4" /> Back
                  </button>
                  
                  <div className="mb-8">
                    <h2 className="text-3xl font-display font-bold mb-2 text-ink">Enter Verification Code</h2>
                    <p className="text-ink-secondary">We've sent a 6-digit code to <span className="font-semibold text-ink">+60{phone}</span></p>
                  </div>
                  
                  <div className="relative mb-6">
                    <input type={showOtp ? 'text' : 'password'} placeholder="••••••" value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="w-full bg-raised rounded-xl px-4 pr-12 py-5 text-3xl tracking-[0.5em] text-center font-bold outline-none focus:ring-2 ring-brand/30 border border-transparent focus:border-brand/30 text-ink transition-all"
                      maxLength={6} autoFocus />
                    <button onClick={() => setShowOtp(!showOtp)} className="absolute right-5 top-1/2 -translate-y-1/2 text-ink-secondary hover:text-ink transition-colors">
                      {showOtp ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  
                  <div className="text-center mb-8">
                    {countdown > 0
                      ? <p className="text-sm text-ink-secondary">Resend code in <span className="font-medium text-ink">{countdown}s</span></p>
                      : <button onClick={handleResend} disabled={loading} className="text-sm font-semibold text-brand hover:underline disabled:opacity-50">Resend OTP Code</button>}
                  </div>
                  
                  <Button onClick={handleVerify} disabled={otp.length < 6 || loading} className="w-full h-14 rounded-xl bg-brand text-white hover:bg-brand/90 shadow-lg shadow-brand/20 font-semibold text-base transition-all">
                    {loading ? 'Verifying...' : 'Verify & Continue'} <ArrowRight className="h-5 w-5 ml-2" />
                  </Button>
                </div>
              )}

              {/* STEP 4: Done */}
              {step === STEP.DONE && (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <motion.div 
                    initial={{ scale: 0 }} 
                    animate={{ scale: 1 }} 
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                    className="w-24 h-24 bg-green-50 rounded-full flex items-center justify-center mb-6"
                  >
                    <CheckCircle2 className="h-12 w-12 text-green-500" />
                  </motion.div>
                  <h2 className="text-2xl font-display font-bold text-ink">Successfully Verified!</h2>
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