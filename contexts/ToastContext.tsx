'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ============================================
// Types
// ============================================
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    duration?: number;
}

interface ToastContextValue {
    toasts: Toast[];
    showToast: (type: ToastType, message: string, duration?: number) => void;
    removeToast: (id: string) => void;
}

// ============================================
// Context
// ============================================
const ToastContext = createContext<ToastContextValue | undefined>(undefined);

// ============================================
// Provider
// ============================================
interface ToastProviderProps {
    children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((type: ToastType, message: string, duration = 3000) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newToast: Toast = { id, type, message, duration };

        setToasts(prev => [...prev, newToast]);

        // 자동 제거
        if (duration > 0) {
            setTimeout(() => {
                setToasts(prev => prev.filter(t => t.id !== id));
            }, duration);
        }
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return (
        <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
}

// ============================================
// Hook
// ============================================
export function useToast() {
    const context = useContext(ToastContext);

    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }

    return context;
}

// ============================================
// Toast Container Component
// ============================================
interface ToastContainerProps {
    toasts: Toast[];
    onRemove: (id: string) => void;
}

function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
            {toasts.map(toast => (
                <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>
    );
}

// ============================================
// Toast Item Component
// ============================================
interface ToastItemProps {
    toast: Toast;
    onRemove: (id: string) => void;
}

const TOAST_STYLES: Record<ToastType, { bg: string; icon: string }> = {
    success: { bg: 'bg-green-600', icon: '✓' },
    error: { bg: 'bg-red-600', icon: '✕' },
    warning: { bg: 'bg-yellow-500', icon: '⚠' },
    info: { bg: 'bg-blue-500', icon: 'ℹ' },
};

function ToastItem({ toast, onRemove }: ToastItemProps) {
    const toastStyle = TOAST_STYLES[toast.type];

    return (
        <div
            className={`
                flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl
                ${toastStyle.bg} text-white
                animate-toast-slide-in
            `}
            role="alert"
        >
            <span className="text-lg font-bold">{toastStyle.icon}</span>
            <span className="text-sm font-medium">{toast.message}</span>
            <button
                onClick={() => onRemove(toast.id)}
                className="ml-2 p-1 hover:bg-white/20 rounded transition-colors"
                aria-label="닫기"
            >
                ✕
            </button>
        </div>
    );
}

export default ToastContext;
