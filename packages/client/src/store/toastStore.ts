import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';

export type ToastKind =
  | 'info'
  | 'success'
  | 'join'
  | 'leave'
  | 'host'
  | 'video'
  | 'warning';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastStore {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'> & { id?: string }) => void;
  removeToast: (id: string) => void;
}

const recentKeys = new Map<string, number>();
const DEDUP_MS = 2000;

/** Prevent duplicate toasts from double socket events or rapid reconnects. */
export function shouldShowToast(key: string): boolean {
  const now = Date.now();
  const last = recentKeys.get(key);
  if (last && now - last < DEDUP_MS) return false;
  recentKeys.set(key, now);
  if (recentKeys.size > 100) {
    for (const [k, t] of recentKeys) {
      if (now - t > DEDUP_MS * 2) recentKeys.delete(k);
    }
  }
  return true;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = toast.id ?? uuidv4();
    set((state) => ({
      toasts: [...state.toasts.slice(-4), { ...toast, id }],
    }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4500);
  },
  removeToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
