import { ShieldAlert, ArrowLeft, Lock } from 'lucide-react';
import { useRole } from '@/lib/rbac';

export default function AccessDenied({
  reason,
  onBack,
  onLogin,
}: {
  reason?: 'role' | 'admin-auth';
  onBack: () => void;
  onLogin?: () => void;
}) {
  const { info } = useRole();
  const needsLogin = reason === 'admin-auth';

  return (
    <div className="flex flex-col items-center justify-center py-16 lg:py-24 text-center">
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 ${needsLogin ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-red-50 dark:bg-red-500/10'}`}>
        {needsLogin ? (
          <Lock className="w-9 h-9 text-amber-500" strokeWidth={2} />
        ) : (
          <ShieldAlert className="w-9 h-9 text-red-500" strokeWidth={2} />
        )}
      </div>

      {needsLogin ? (
        <>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Admin Login Required</h2>
          <p className="am text-lg text-slate-600 dark:text-slate-300 mt-1">የአስተዳዳሪ መግቢያ ያስፈልጋል</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-3 leading-relaxed">
            This area is restricted. Sign in with an admin account to continue.
          </p>
          <p className="am text-sm text-slate-400 dark:text-slate-500 max-w-md mt-1 leading-relaxed">
            ይህ ክፍል ለአስተዳዳሪዎች ብቻ ነው። ለመቀጠል ይግቡ።
          </p>
          <div className="mt-6 flex items-center gap-3">
            {onLogin && (
              <button
                onClick={onLogin}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 px-4 py-2.5 text-sm font-semibold text-slate-900 hover:from-amber-400 hover:to-orange-400 transition-colors shadow-md shadow-orange-500/20"
              >
                <Lock className="w-4 h-4" />
                Admin Login · <span className="am">ይግቡ</span>
              </button>
            )}
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back · <span className="am">ተመለስ</span>
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">Access Denied</h2>
          <p className="am text-lg text-slate-600 dark:text-slate-300 mt-1">ፍቃድ የለዎትም</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mt-3 leading-relaxed">
            Your current role <span className="font-semibold text-slate-700 dark:text-slate-200">{info.label}</span> does not have
            permission to view this module.
          </p>
          <p className="am text-sm text-slate-400 dark:text-slate-500 max-w-md mt-1 leading-relaxed">
            አሁን ያለዎት ሁኔታ <span className="font-semibold">{info.am}</span> ይህን ክፍል ለመመልከት ፍቃድ የለውም።
          </p>
          <button
            onClick={onBack}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-slate-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 dark:hover:bg-slate-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to my module · <span className="am">ወደ ክፍሌ ተመለስ</span>
          </button>
        </>
      )}
    </div>
  );
}
