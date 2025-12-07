'use client';

import { Fragment } from 'react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

const variantStyles = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-yellow-500 hover:bg-yellow-600',
    info: 'bg-[#1E6FFB] hover:bg-[#1E6FFB]/90',
};

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  onConfirm,
  onCancel,
  variant = 'info',
}: ConfirmModalProps) {
  if (!isOpen) {
    return null;
  }

  const confirmButtonClass = `w-full px-4 py-2 text-sm font-semibold text-white rounded-md transition-colors ${variantStyles[variant]}`;

  return (
    <div
      data-testid="confirm-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      aria-labelledby="modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md p-6 mx-4 bg-[#1E1F2B] rounded-xl shadow-lg">
        <h3 id="modal-title" className="text-lg font-bold text-white">
          {title}
        </h3>
        <p className="mt-2 text-sm text-gray-300">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            data-testid="cancel-button"
            onClick={onCancel}
            type="button"
            className="px-4 py-2 text-sm font-semibold text-gray-300 bg-transparent rounded-md hover:bg-white/10"
          >
            {cancelText}
          </button>
          <button
            data-testid="confirm-button"
            onClick={onConfirm}
            type="button"
            className={confirmButtonClass}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
