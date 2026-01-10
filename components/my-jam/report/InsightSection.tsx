'use client';

import React from 'react';
import { AlertCircle, Lightbulb, CheckCircle2, TrendingUp } from 'lucide-react';

type SuggestionType = 'user' | 'system' | 'positive';

interface Suggestion {
  type: SuggestionType;
  title: string;
  desc: string;
}

interface EditStats {
  totalNotes: number;
  editedNotes: number;
  pitchEdits: number;
  timingEdits: number;
  lengthEdits: number;
}

interface InsightSectionProps {
  editStats?: EditStats;
  suggestions?: Suggestion[];
}

const defaultEditStats: EditStats = {
  totalNotes: 25,
  editedNotes: 8,
  pitchEdits: 5,
  timingEdits: 2,
  lengthEdits: 1
};

const defaultSuggestions: Suggestion[] = [
  { 
    type: 'user', 
    title: '저음역 피치 보정 필요', 
    desc: '저음역(D2-G2) 구간에서 타겟 음정보다 낮게 연주되는 경향이 있습니다.' 
  },
  { 
    type: 'positive', 
    title: '훌륭한 리듬감!', 
    desc: '곡 전체적으로 타이밍 정확도가 매우 높습니다.' 
  }
];

const InsightSection: React.FC<InsightSectionProps> = ({ 
  editStats = defaultEditStats,
  suggestions = defaultSuggestions
}) => {
  const editRate = Math.round((editStats.editedNotes / editStats.totalNotes) * 100);

  const getIcon = (type: SuggestionType) => {
    switch (type) {
      case 'user':
        return <AlertCircle size={16} />;
      case 'system':
        return <AlertCircle size={16} />;
      case 'positive':
        return <CheckCircle2 size={16} />;
    }
  };

  const getStyles = (type: SuggestionType) => {
    switch (type) {
      case 'user':
        return 'bg-[#FF6B6B]/5 border-[#FF6B6B]/40 text-[#FF6B6B]';
      case 'system':
        return 'bg-[#9B9B9B]/5 border-[#9B9B9B]/40 text-[#9B9B9B]';
      case 'positive':
        return 'bg-[#3DDF85]/5 border-[#3DDF85]/40 text-[#3DDF85]';
    }
  };

  return (
    <div className="space-y-8">
      {/* Edit Statistics */}
      <div className="bg-white/5 p-6 rounded-3xl border border-white/5">
        <div className="flex justify-between items-end mb-6">
          <div>
            <h4 className="text-xs font-bold text-gray-400 mb-1">수정 통계</h4>
            <p className="text-2xl font-black text-white">
              {editStats.totalNotes}개 중 {editStats.editedNotes}개 수정 
              <span className="text-[#FF6B6B] ml-1">({editRate}%)</span>
            </p>
          </div>
          <TrendingUp size={24} className="text-[#3DDF85] opacity-30" />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-black/20 p-2 rounded-lg">
            <span className="text-[10px] text-gray-500 block mb-0.5">음정</span>
            <span className="text-xs font-bold text-[#7BA7FF]">{editStats.pitchEdits}</span>
          </div>
          <div className="bg-black/20 p-2 rounded-lg">
            <span className="text-[10px] text-gray-500 block mb-0.5">타이밍</span>
            <span className="text-xs font-bold text-[#FF6B6B]">{editStats.timingEdits}</span>
          </div>
          <div className="bg-black/20 p-2 rounded-lg">
            <span className="text-[10px] text-gray-500 block mb-0.5">길이</span>
            <span className="text-xs font-bold text-[#3DDF85]">{editStats.lengthEdits}</span>
          </div>
        </div>
      </div>

      {/* AI Suggestions */}
      <div className="space-y-4">
        <h5 className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2 px-1">
          <Lightbulb size={12} className="text-[#F2C94C]" /> AI 개선 제안
        </h5>
        {suggestions.map((s, i) => (
          <div 
            key={i} 
            className={`flex gap-4 p-5 rounded-2xl border-l-4 ${getStyles(s.type)}`}
          >
            <div className="mt-1">{getIcon(s.type)}</div>
            <div>
              <h6 className="text-sm font-bold text-white mb-1">{s.title}</h6>
              <p className="text-xs text-gray-400 leading-relaxed">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default InsightSection;
