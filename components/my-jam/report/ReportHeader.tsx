'use client';

import React from 'react';
import { X, Calendar } from 'lucide-react';

interface ReportHeaderProps {
  onClose: () => void;
  jamName: string;
  songTitle: string;
  artist: string;
  recordedDate: string;
}

const ReportHeader: React.FC<ReportHeaderProps> = ({ 
  onClose, 
  jamName, 
  songTitle, 
  artist, 
  recordedDate 
}) => {
  return (
    <div className="p-8 border-b border-white/10 bg-gradient-to-b from-[#1B1C26] to-[#14151C] sticky top-0 z-50">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-[#3DDF85]/10 border border-[#3DDF85]/30 px-3 py-1 rounded-full shadow-[0_0_15px_rgba(61,223,133,0.15)]">
            <span className="text-[10px] font-black text-[#3DDF85] tracking-[0.2em] uppercase">AI REPORT</span>
          </div>
          <div className="h-1 w-8 bg-gradient-to-r from-[#3DDF85]/50 to-transparent rounded-full"></div>
        </div>
        <button 
          onClick={onClose}
          className="group w-10 h-10 flex items-center justify-center rounded-full bg-[#2A2B39] border border-white/10 transition-all hover:border-[#FF6B6B]/50 hover:bg-[#FF6B6B]/10 active:scale-90"
        >
          <X size={18} className="text-gray-400 group-hover:text-[#FF6B6B] transition-colors" />
        </button>
      </div>

      <div>
        <h3 className="text-2xl font-black text-white mb-2">{songTitle}</h3>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 px-2 py-1 bg-white/5 rounded border border-white/5">
            <span className="text-[10px] text-gray-500 font-bold">JAM ID:</span>
            <span className="text-[10px] text-gray-300 font-mono">{jamName}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400 font-medium">{artist}</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-[#7BA7FF] bg-[#7BA7FF]/5 px-3 py-1 rounded-full border border-[#7BA7FF]/20">
            <Calendar size={12} />
            {recordedDate}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportHeader;
