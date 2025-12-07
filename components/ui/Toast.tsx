'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type: 'info' | 'warning' | 'error';
  duration?: number;
  onClose?: () => void;
}

const typeStyles = {
  info: {
    bg: 'bg-[#1E6FFB]',
    icon: 'ℹ️',
  },
  warning: {
    bg: 'bg-[#FFD166]',
    icon: '⚠️',
  },
  error: {
    bg: 'bg-[#FF7B7B]',
    icon: '❌',
  },
};

export default function Toast({ message, type, duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
    }, duration);

    return () => {
      clearTimeout(timer);
    };
  }, [duration]);

  const handleClose = () => {
    setIsVisible(false);
  };

  // When visibility changes to false, call the parent onClose after the animation
  useEffect(() => {
    if (!isVisible) {
      const animationTimer = setTimeout(() => {
        if (onClose) {
          onClose();
        }
      }, 300); // Corresponds to fade-out duration
      return () => clearTimeout(animationTimer);
    }
  }, [isVisible, onClose]);
  
  if (!isVisible) return null;

  return (
    <div
      data-testid="toast-message"
      className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center justify-between gap-4 px-4 py-3 rounded-lg shadow-lg text-white transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'} ${typeStyles[type].bg}`}
    >
      <span className="text-sm font-medium">{message}</span>
      <button onClick={handleClose} className="p-1 rounded-full hover:bg-white/20">
        <X size={16} />
      </button>
    </div>
  );
}
