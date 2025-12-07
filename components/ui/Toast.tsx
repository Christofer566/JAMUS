'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string | null;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, onClose, duration = 3000 }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (message) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
      }, duration);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [message, duration]);

  useEffect(() => {
    if (!isVisible && message) {
      // Call onClose after the fade-out animation
      const closeTimer = setTimeout(onClose, 300);
      return () => clearTimeout(closeTimer);
    }
  }, [isVisible, message, onClose]);

  return (
    <div
      data-testid="toast-message"
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 ${
        isVisible && message ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
    >
      {message && (
         <div className="flex items-center justify-between gap-4 bg-gray-800 text-white rounded-lg shadow-lg px-4 py-2">
            <span className="text-sm font-medium">{message}</span>
            <button onClick={() => setIsVisible(false)} className="p-1 rounded-full hover:bg-white/20">
                <X size={16} />
            </button>
        </div>
      )}
    </div>
  );
}