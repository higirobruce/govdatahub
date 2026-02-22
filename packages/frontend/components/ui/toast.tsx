'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle, AlertCircle, Info, XCircle } from 'lucide-react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration: number = 3000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, type, message, duration };

    setToasts(prev => [...prev, newToast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const getIcon = (type: ToastType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-[#4ade80]" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-[#ef4444]" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5 text-[#fb923c]" />;
      case 'info':
        return <Info className="w-5 h-5 text-[#60a5fa]" />;
    }
  };

  const getStyles = (type: ToastType) => {
    switch (type) {
      case 'success':
        return 'bg-[#f0fdf4] border-[#4ade80]';
      case 'error':
        return 'bg-[#fef2f2] border-[#ef4444]';
      case 'warning':
        return 'bg-[#fff7ed] border-[#fb923c]';
      case 'info':
        return 'bg-[#eff6ff] border-[#60a5fa]';
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-md">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`flex items-start gap-3 p-4 rounded-lg border-2 shadow-lg animate-in slide-in-from-top-5 ${getStyles(toast.type)}`}
          >
            {getIcon(toast.type)}
            <p className="flex-1 text-sm text-[#1a1a1a] font-medium">
              {toast.message}
            </p>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-0.5 hover:bg-black/10 rounded transition-colors"
            >
              <X className="w-4 h-4 text-[#555555]" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
