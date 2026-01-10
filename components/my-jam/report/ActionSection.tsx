'use client';

import React from 'react';
import { X, Play, ChevronRight } from 'lucide-react';

interface ActionSectionProps {
  onClose: () => void;
  onPractice: () => void;
}

const ActionSection: React.FC<ActionSectionProps> = ({ onClose, onPractice }) => {
  return (
    <div className="sticky bottom-8 left-0 w-full px-8 z-[100] pointer-events-none">
      <div className="max-w-md mx-auto p-2 bg-[#2A2B39]/60 backdrop-blur-2xl rounded-[24px] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-2 pointer-events-auto">
        <button 
          onClick={onClose}
          className="w-14 h-14 flex items-center justify-center rounded-2xl bg-white/5 text-gray-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
        <button 
          onClick={onPractice}
          className="relative flex-1 h-14 rounded-2xl bg-[#3DDF85] text-[#1B1C26] font-black text-sm flex items-center justify-center gap-2 overflow-hidden group hover:brightness-110 active:scale-[0.98] transition-all"
        >
          <Play size={18} fill="currentColor" />
          다시 연습하기
          <ChevronRight size={16} className="opacity-50 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
};

export default ActionSection;
