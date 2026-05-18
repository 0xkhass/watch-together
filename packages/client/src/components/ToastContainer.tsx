import { motion, AnimatePresence } from 'framer-motion';
import { UserPlus, UserMinus, Crown, Film, Wifi, X, Info } from 'lucide-react';
import { useToastStore, ToastKind } from '../store/toastStore';

const ICONS: Record<ToastKind, typeof Info> = {
  info: Info,
  success: Wifi,
  join: UserPlus,
  leave: UserMinus,
  host: Crown,
  video: Film,
  warning: Info,
};

const STYLES: Record<ToastKind, string> = {
  info: 'border-cyan-500/30 bg-cyan-500/10',
  success: 'border-green-500/30 bg-green-500/10',
  join: 'border-green-500/30 bg-green-500/10',
  leave: 'border-rose-500/30 bg-rose-500/10',
  host: 'border-yellow-500/30 bg-yellow-500/10',
  video: 'border-accent/30 bg-accent/10',
  warning: 'border-amber-500/30 bg-amber-500/10',
};

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <motion.div
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => {
          const Icon = ICONS[toast.kind];
          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`pointer-events-auto flex items-start gap-3 p-3 rounded-xl border backdrop-blur-md shadow-lg ${STYLES[toast.kind]}`}
            >
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
                <Icon className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0 pt-0.5">
                <p className="text-sm font-medium text-white leading-tight">{toast.title}</p>
                {toast.message && (
                  <p className="text-xs text-text-muted mt-0.5 truncate">{toast.message}</p>
                )}
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="p-1 hover:bg-white/10 rounded-md transition-colors flex-shrink-0"
              >
                <X className="w-3.5 h-3.5 text-text-muted" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </motion.div>
  );
}
