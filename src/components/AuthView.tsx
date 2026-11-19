import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import type { GymSettings, LockState, Role } from '../types';
import { RECOVERY_QUESTIONS, hashPassword, isStrongPassword, makeCredentials } from '../utils/crypto';
import { authenticateBiometric } from '../utils/biometric';
import { getBioSetting } from '../utils/storage';
import { Modal } from './Modal';

interface AuthViewProps {
  settings: GymSettings;
  lock: LockState;
  onSaveSettings: (next: GymSettings) => void;
  onAuthenticated: (role: Role, username: string) => void;
  onUpdateLock: (next: LockState) => void;
  onToast: (msg: string) => void;
}

export const AuthView: React.FC<AuthViewProps> = ({
  settings,
  lock,
  onSaveSettings,
  onAuthenticated,
  onUpdateLock,
  onToast,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [authMode, setAuthMode] = useState<'password' | 'pin'>('password');
  const [recQuestion, setRecQuestion] = useState(0);
  const [recAnswer, setRecAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [forgotNewPw, setForgotNewPw] = useState('');
  const [imgFailed, setImgFailed] = useState(false);

  const bioAttemptedRef = useRef(false);
  const bioSetting = getBioSetting();
  const hasQuickPin = Boolean(settings.pin && settings.owner);
  const isLockedOut = Boolean(lock.until && lock.until > Date.now());
  const lockoutMinutes = isLockedOut ? Math.ceil(((lock.until || 0) - Date.now()) / 60000) : 0;

  const handleBiometricLogin = async () => {
    if (lock.until && lock.until > Date.now()) return;
    const res = await authenticateBiometric();
    if (!res.ok || !res.bio) {
      if (res.message) onToast(res.message);
      return;
    }
    const creds = settings[res.bio.role];
    if (!creds || creds.u !== res.bio.user) {
      onToast('Fingerprint login is outdated. Sign in with your password.');
      return;
    }
    onUpdateLock({});
    onAuthenticated(res.bio.role, res.bio.user);
  };

  useEffect(() => {
    if (settings.owner && bioSetting && !bioAttemptedRef.current && !isLockedOut) {
      bioAttemptedRef.current = true;
      const timer = setTimeout(() => {
        void handleBiometricLogin();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [settings.owner, isLockedOut]);

  const handleOwnerSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim().toLowerCase();
    const a = recAnswer.trim().toLowerCase();
    if (!u || !isStrongPassword(password)) {
      onToast('Enter a username; password needs 8+ characters with letters and numbers');
      return;
    }
    if (a.length < 3) {
      onToast('Enter a recovery answer (3+ characters)');
      return;
    }
    setSubmitting(true);
    try {
      const ownerCreds = await makeCredentials(u, password);
      const recCreds = await makeCredentials('x', a);
      const nextSettings: GymSettings = {
        ...settings,
        gym: settings.gym === 'My Gym' ? 'MUSCLE MAX GYM' : settings.gym,
        owner: ownerCreds,
        rec: { i: recQuestion, s: recCreds.s, h: recCreds.h },
      };
      onSaveSettings(nextSettings);
      onAuthenticated('owner', u);
    } finally {
      setSubmitting(false);
    }
  };

  const recordFailedAttempt = () => {
    const attempts = (lock.n || 0) + 1;
    const nextLock: LockState = { n: attempts };
    if (attempts >= 5) {
      nextLock.until = Date.now() + Math.min(60, 5 * Math.pow(2, attempts - 5)) * 60000;
    }
    onUpdateLock(nextLock);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lock.until && lock.until > Date.now()) {
      onToast(`Too many wrong attempts. Try again in ${lockoutMinutes} minute(s).`);
      return;
    }

    if (authMode === 'pin' && settings.pin && settings.owner) {
      if (!/^\d{4,6}$/.test(pinInput)) {
        onToast('Enter your 4-6 digit Quick PIN');
        return;
      }
      setSubmitting(true);
      try {
        const matched = (await hashPassword(pinInput, settings.pin.s)) === settings.pin.h;
        if (matched) {
          onUpdateLock({});
          onAuthenticated('owner', settings.owner.u);
        } else {
          recordFailedAttempt();
          setPinInput('');
          onToast('Incorrect Quick PIN');
        }
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const u = username.trim().toLowerCase();
    if (!u || !password) {
      onToast('Enter your username and password');
      return;
    }
    setSubmitting(true);
    try {
      let matchedRole: Role | null = null;
      for (const roleKey of ['owner', 'staff'] as const) {
        const creds = settings[roleKey];
        if (creds && creds.u === u && (await hashPassword(password, creds.s)) === creds.h) {
          matchedRole = roleKey;
          break;
        }
      }
      if (matchedRole) {
        onUpdateLock({});
        onAuthenticated(matchedRole, u);
      } else {
        recordFailedAttempt();
        onToast('Wrong username or password');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecoverOwner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings.rec || !settings.owner) return;
    const ans = forgotAnswer.trim().toLowerCase();
    if (!ans || !isStrongPassword(forgotNewPw)) {
      onToast('Enter the answer and a strong new password (8+, letters + numbers)');
      return;
    }
    const checkHash = await hashPassword(ans, settings.rec.s);
    if (checkHash !== settings.rec.h) {
      onToast('Wrong recovery answer');
      return;
    }
    const updatedOwner = await makeCredentials(settings.owner.u, forgotNewPw);
    onSaveSettings({ ...settings, owner: updatedOwner });
    onUpdateLock({});
    setForgotOpen(false);
    setForgotAnswer('');
    setForgotNewPw('');
    onToast('Password reset. Sign in with the new password.');
  };

  return (
    <div className="min-h-screen bg-[#F4F6F8] dark:bg-[#0B0F14] text-slate-900 dark:text-[#EEF1F4] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-2 rounded-2xl overflow-hidden bg-white dark:bg-[#151B22] border border-slate-200 dark:border-[#27303A] shadow-xl">
        {/* Brand Identity Panel */}
        <div className="bg-[#0B0F14] text-[#EEF1F4] p-8 sm:p-10 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-[#27303A]">
          <div>
            <div className="flex items-center gap-4 mb-6">
              {!imgFailed ? (
                <img
                  src="/assets/aistudio/ic_launcher_329629c3.png"
                  alt="Muscle Max Gym logo"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="w-16 h-16 rounded-xl object-cover border border-[#27303A]"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-[#D62828] flex items-center justify-center font-display text-2xl font-bold text-white">
                  MM
                </div>
              )}
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-wide text-white leading-none">
                  {settings.gym}
                </h1>
                <p className="text-sm text-[#9AA6B4] mt-1">
                  Operations &amp; Membership Console
                </p>
              </div>
            </div>

            <p className="text-sm text-[#9AA6B4] leading-relaxed max-w-sm">
              Track memberships, partial fee balances, quick check-ins, body measurements, expenses, and WhatsApp reminders behind fingerprint &amp; PIN security.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-[#27303A] grid grid-cols-2 gap-4 text-xs text-[#9AA6B4]">
            <div>
              <div className="text-white font-semibold mb-1">Biometric &amp; PIN Lock</div>
              <div>Fingerprint unlock, quick PIN entry, and sensitive action protection.</div>
            </div>
            <div>
              <div className="text-white font-semibold mb-1">Front-Desk Speed</div>
              <div>1-tap member check-ins, digital passes, and instant WhatsApp receipts.</div>
            </div>
          </div>
        </div>

        {/* Form Panel */}
        <div className="p-6 sm:p-10 flex flex-col justify-center">
          {!settings.owner ? (
            <form onSubmit={handleOwnerSetup} className="space-y-4">
              <div>
                <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                  First-Time Owner Setup
                </h2>
                <p className="text-sm text-slate-500 dark:text-[#9AA6B4] mt-1">
                  Create the primary owner account to unlock your gym workspace.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="setup-u">
                  Owner username
                </label>
                <input
                  id="setup-u"
                  type="text"
                  autoCapitalize="none"
                  autoComplete="off"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                  placeholder="e.g. owner"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="setup-p">
                  Password (8+ characters, letters and numbers)
                </label>
                <input
                  id="setup-p"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                  placeholder="Create strong password"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="setup-rq">
                  Recovery question (to reset a forgotten password)
                </label>
                <select
                  id="setup-rq"
                  value={recQuestion}
                  onChange={(e) => setRecQuestion(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828] mb-2"
                >
                  {RECOVERY_QUESTIONS.map((q, idx) => (
                    <option key={q} value={idx}>
                      {q}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  autoComplete="off"
                  value={recAnswer}
                  onChange={(e) => setRecAnswer(e.target.value)}
                  placeholder="Recovery answer (3+ characters)"
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Create owner account</span>
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                    Sign in
                  </h2>
                  <p className="text-sm text-slate-500 dark:text-[#9AA6B4] mt-0.5">
                    {authMode === 'pin' ? 'Enter owner Quick PIN' : 'Enter your owner or staff credentials.'}
                  </p>
                </div>

                {hasQuickPin && (
                  <div className="inline-flex p-1 rounded-xl bg-slate-100 dark:bg-[#0B0F14] border border-slate-200 dark:border-[#27303A]">
                    <button
                      type="button"
                      onClick={() => setAuthMode('password')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        authMode === 'password'
                          ? 'bg-[#D62828] text-white'
                          : 'text-slate-600 dark:text-[#9AA6B4]'
                      }`}
                    >
                      Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setAuthMode('pin')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        authMode === 'pin'
                          ? 'bg-[#D62828] text-white'
                          : 'text-slate-600 dark:text-[#9AA6B4]'
                      }`}
                    >
                      PIN
                    </button>
                  </div>
                )}
              </div>

              {authMode === 'pin' && hasQuickPin ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="login-pin">
                    Quick Security PIN (4–6 digits)
                  </label>
                  <input
                    id="login-pin"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    placeholder="••••"
                    className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-center font-mono text-xl tracking-[0.5em] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="login-u">
                      Username
                    </label>
                    <input
                      id="login-u"
                      type="text"
                      autoCapitalize="none"
                      autoComplete="off"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5" htmlFor="login-p">
                      Password
                    </label>
                    <input
                      id="login-p"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
                    />
                  </div>
                </>
              )}

              {isLockedOut && (
                <p className="text-sm text-[#C62828] dark:text-[#FF7B72] font-medium">
                  Too many wrong attempts. Try again in {lockoutMinutes} minute(s).
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || isLockedOut}
                className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white font-semibold transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Lock className="w-4 h-4" />
                <span>Sign in</span>
              </button>

              {bioSetting && (
                <button
                  type="button"
                  disabled={isLockedOut}
                  onClick={handleBiometricLogin}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#27303A] hover:bg-slate-800 dark:hover:bg-[#323d49] text-white font-medium transition-colors inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Fingerprint className="w-5 h-5 text-[#FF4D4D]" />
                  <span>Unlock with fingerprint</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setForgotOpen(true)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] text-slate-700 dark:text-[#EEF1F4] hover:bg-slate-50 dark:hover:bg-[#1E2630] font-medium transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <KeyRound className="w-4 h-4" />
                <span>Forgot password?</span>
              </button>
            </form>
          )}
        </div>
      </div>

      <Modal open={forgotOpen} onClose={() => setForgotOpen(false)} title="Forgot password">
        {settings.rec ? (
          <form onSubmit={handleRecoverOwner} className="space-y-4">
            <p className="text-sm text-slate-600 dark:text-[#9AA6B4]">
              <strong className="text-slate-900 dark:text-white">Owner:</strong> answer your recovery question to set a new password.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5">
                {RECOVERY_QUESTIONS[settings.rec.i]}
              </label>
              <input
                type="text"
                autoComplete="off"
                value={forgotAnswer}
                onChange={(e) => setForgotAnswer(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-[#9AA6B4] mb-1.5">
                New password (8+ characters, letters and numbers)
              </label>
              <input
                type="password"
                value={forgotNewPw}
                onChange={(e) => setForgotNewPw(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-[#27303A] bg-slate-50 dark:bg-[#0B0F14] text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#D62828]"
              />
            </div>
            <p className="text-xs text-slate-500 dark:text-[#9AA6B4]">
              Staff: ask the owner to reset your login in Settings.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
              >
                Close
              </button>
              <button
                type="submit"
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#D62828] hover:bg-[#b91c1c] text-white text-sm font-semibold cursor-pointer"
              >
                Reset owner password
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm">Staff: ask the owner to reset your login in Settings.</p>
            <p className="text-sm text-slate-500 dark:text-[#9AA6B4]">
              Owner: no recovery question was set. Without it, app data must be cleared and restored from your Google Sheet or JSON backup.
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-200 dark:border-[#27303A] text-sm font-medium cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
