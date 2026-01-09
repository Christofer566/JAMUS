'use client';

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface SaveJamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  defaultName?: string;
}

export default function SaveJamModal({ isOpen, onClose, onSave, defaultName = '' }: SaveJamModalProps) {
  const [name, setName] = useState(defaultName);

  useEffect(() => {
    if (isOpen) {
      setName(defaultName);
    }
  }, [isOpen, defaultName]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (!name.trim()) return;
    onSave(name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-[#2A2B39] rounded-xl p-6 shadow-2xl transform transition-all">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">JAM 저장하기</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Input */}
        <div className="mb-6 relative">
          <input
            type="text"
            value={name}
            onChange={(e) => {
              if (e.target.value.length <= 30) {
                setName(e.target.value);
              }
            }}
            placeholder="JAM 이름을 입력하세요"
            className="w-full bg-[#1B1C26] border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-hidden focus:border-[#7BA7FF] focus:ring-1 focus:ring-[#7BA7FF] transition-all"
            autoFocus
          />
          <div className="absolute right-3 bottom-3 text-xs text-[#9B9B9B]">
            {name.length}/30
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 rounded-lg bg-transparent border border-white/20 text-[#9B9B9B] font-medium hover:text-white hover:border-white/40 transition-colors"
          >
            저장 안함
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="flex-1 py-3 px-4 rounded-lg bg-[#7BA7FF] text-white font-medium hover:bg-[#6A96EE] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
}
