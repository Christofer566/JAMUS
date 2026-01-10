'use client';

import React from 'react';
import { Award, Trophy } from 'lucide-react';

interface TotalScoreSectionProps {
  score: number;
  pitchScore?: number;
  timingScore?: number;
  dynamicsScore?: number;
  recoveryScore?: number;
}

const TotalScoreSection: React.FC<TotalScoreSectionProps> = ({ 
  score,
  pitchScore = 88,
  timingScore = 72,
  dynamicsScore = 85,
  recoveryScore = 92
}) => {
  const config = score >= 80 
    ? { color: '#3DDF85', text: '훌륭해요!', icon: <Award size={20} />, sub: '프로 연주자 수준의 완벽한 퍼포먼스입니다.' }
    : score >= 60
    ? { color: '#7BA7FF', text: '잘하고 있어요', icon: <Trophy size={20} />, sub: '안정적인 연주입니다. 조금만 더 다듬어볼까요?' }
    : { color: '#F2C94C', text: '조금 더 연습해봐요', icon: <Trophy size={20} />, sub: '기초가 탄탄해지고 있어요. 꾸준히 연습해보세요!' };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-8 rounded-3xl bg-[#1B1C26] border border-white/5 shadow-2xl">
      <div className="flex flex-col justify-center space-y-4">
        <div>
          <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Overall Assessment</h4>
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-black tracking-tighter text-white">{score}</span>
            <span className="text-xl font-bold italic" style={{ color: config.color }}>SCORE</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white/5 border border-white/5">
          <div className="flex items-center gap-3 text-white mb-1">
            <div style={{ color: config.color }}>{config.icon}</div>
            <span className="text-sm font-bold">{config.text}</span>
          </div>
          <p className="text-[11px] text-gray-500 leading-snug">{config.sub}</p>
        </div>
      </div>

      <div className="space-y-4 flex flex-col justify-center border-l border-white/5 pl-6">
        <MetricRow label="Pitch" value={pitchScore} color="#7BA7FF" />
        <MetricRow label="Timing" value={timingScore} color="#FF6B6B" />
        <MetricRow label="Dynamics" value={dynamicsScore} color="#3DDF85" />
        <MetricRow label="Recovery" value={recoveryScore} color="#F2C94C" />
      </div>
    </div>
  );
};

const MetricRow = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="space-y-1.5">
    <div className="flex justify-between items-center px-0.5">
      <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{label}</span>
      <span className="text-[10px] font-mono text-white/40">{value}%</span>
    </div>
    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
      <div 
        className="h-full rounded-full transition-all duration-1000" 
        style={{ width: `${value}%`, backgroundColor: color }}
      ></div>
    </div>
  </div>
);

export default TotalScoreSection;
