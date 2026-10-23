import { useEffect, useState } from 'react';
import { Shield, Lock, User, X, KeyRound, Eye, EyeOff, HardHat, LogOut } from 'lucide-react';
import { useAdminAuth } from '@/lib/adminAuth';
import { Button, inputClass } from '@/components/ui';

type Mode = 'login' | 'change' | 'reset';

export default function AdminLogin({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { login, changePassword, resetPassword } = useAdminAuth();
  const [recoveryKey, setRecoveryKey] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setError(null);
    if (mode !== 'login') setNotice(null);
  }, [mode]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    const res = await login(username, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Login failed.');
      return;
    }
    if (res.mustChangePassword) {
      setMode('change');
    } else {
      onSuccess();
    }
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!recoveryKey.trim()) return setError('Enter the admin recovery key.');
    if (newPassword.length < 8) return setError('New password must be at least 8 characters.');
    if (newPassword !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    const res = await resetPassword(recoveryKey, newPassword);
    setBusy(false);
    if (!res.ok) return setError(res.error ?? 'Could not reset password.');
    setNewPassword('');
    setConfirm('');
    setRecoveryKey('');
    setPassword('');
    setNotice('Password reset. Sign in with your new password.');
    setMode('login');
  }

  async function handleChange(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    const res = await changePassword(newPassword);
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? 'Could not change password.');
      return;
    }
    onSuccess();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 no-print">
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden animate-fade-in-up">
        {/* Header banner */}
        <div className="relative px-6 pt-7 pb-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/30 mb-4">
            <HardHat className="w-7 h-7 text-slate-900" strokeWidth={2.2} />
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            {mode === 'login' ? 'Admin Login' : mode === 'reset' ? 'Reset Admin Password' : 'Set New Password'}
          </h2>
          <p className="am text-sm text-slate-300 mt-0.5">
            {mode === 'login' ? 'የአስተዳዳሪ መግቢያ' : mode === 'reset' ? 'የይለፍ ቃል ዳግም ማስጀመር' : 'አዲስ የይለፍ ቃል ያስገቡ'}
          </p>
          <div className="flex items-center gap-1.5 mt-3 text-[11px] text-amber-300/90">
            <Shield className="w-3.5 h-3.5" />
            <span>Restricted area · authorized staff only</span>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 bg-white dark:bg-slate-900">
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <label className="block">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Username
                </span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="username"
                  className={inputClass}
                  placeholder="admin"
                />
              </label>

              <label className="block">
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  Password
                </span>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className={`${inputClass} pr-10`}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </label>

              {notice && (
                <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">{notice}</div>
              )}
              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <Button type="submit" loading={busy} className="w-full">
                <Shield className="w-4 h-4" /> Sign in to Admin
              </Button>

              <button
                type="button"
                onClick={() => setMode('reset')}
                className="block w-full text-center text-xs font-semibold text-amber-600 hover:text-amber-700"
              >
                Forgot password? / የይለፍ ቃል ረስተዋል?
              </button>

              <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center leading-relaxed pt-1">
                Default admin: <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">admin / ChangeMe123!</span>
                <br />You will be asked to change it on first login.
              </p>
            </form>
          ) : mode === 'reset' ? (
            <form onSubmit={handleReset} className="space-y-4">
              <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-800 flex gap-2.5">
                <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Enter the admin recovery key to set a new password for the <b>admin</b> account.</span>
              </div>
              <label className="block">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Recovery Key</span>
                <input
                  value={recoveryKey}
                  onChange={(e) => setRecoveryKey(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  className={`${inputClass} font-mono`}
                  placeholder="Recovery key"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">New Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                  placeholder="At least 8 characters"
                />
              </label>
              <label className="block">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Confirm Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                />
              </label>
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
              )}
              <Button type="submit" loading={busy} className="w-full">
                <KeyRound className="w-4 h-4" /> Reset password
              </Button>
              <button
                type="button"
                onClick={() => setMode('login')}
                className="block w-full text-center text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                ← Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleChange} className="space-y-4">
              <div className="rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 px-4 py-3 text-sm text-amber-800 dark:text-amber-300 flex gap-2.5">
                <KeyRound className="w-4 h-4 mt-0.5 shrink-0" />
                <span>This is your first login. Please set a new password to secure your account.</span>
              </div>

              <label className="block">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">New Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoFocus
                  autoComplete="new-password"
                  className={`${inputClass} pr-10`}
                  placeholder="At least 8 characters"
                />
              </label>

              <label className="block">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300 mb-1.5 block">Confirm Password</span>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className={inputClass}
                  placeholder="Re-enter new password"
                />
              </label>

              {error && (
                <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-xl px-4 py-3">
                  {error}
                </div>
              )}

              <Button type="submit" loading={busy} className="w-full">
                <KeyRound className="w-4 h-4" /> Update & continue
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/** Compact "logged-in admin" badge + logout shown in the header when an admin is signed in. */
export function AdminSessionBadge({ onLogout }: { onLogout: () => void }) {
  const { user } = useAdminAuth();
  if (!user) return null;
  return (
    <div className="no-print flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-2.5 lg:px-3 py-1.5 lg:py-2">
      <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="hidden sm:flex flex-col leading-tight text-left">
        <span className="text-[13px] font-semibold text-amber-800 dark:text-amber-300">{user.displayName}</span>
        <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase tracking-wide">{user.role}</span>
      </div>
      <button
        onClick={onLogout}
        className="ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
        title="Log out of admin"
      >
        <LogOut className="w-3.5 h-3.5" /> Log out
      </button>
    </div>
  );
}
