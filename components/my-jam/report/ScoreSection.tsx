'use client';

import React from 'react';
import { Info } from 'lucide-react';

type MeasureStatus = 'accurate' | 'user_error' | 'system_limit' | 'unconfirmed';

interface MeasureData {
  id: number;
  status: MeasureStatus;
}

interface ScoreSectionProps {
  measures?: MeasureData[];
  focusMeasures?: number[];
}

const HIGHLIGHT_COLORS: Record<MeasureStatus, { accent: string; label: string }> = {
  accurate: { accent: 'bg-[#3DDF85]', label: '정확' },
  user_error: { accent: 'bg-[#FF6B6B]', label: '사용자 실수' },
  system_limit: { accent: 'bg-[#9B9B9B]', label: 'AI 한계' },
  unconfirmed: { accent: 'bg-[#F2C94C]', label: '미확인' },
};

const defaultMeasures: MeasureData[] = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  status: i === 8 || i === 9 ? 'user_error' : i > 10 ? 'unconfirmed' : 'accurate'
}));

const ScoreSection: React.FC<ScoreSectionProps> = ({ 
  measures = defaultMeasures,
  focusMeasures = [9, 10]
}) => {
  return (
    <div className="space-y-6">
      {/* Heatmap */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-1">전체 곡 분석 히트맵</h4>
        <div className="h-6 w-full bg-white/5 rounded-full overflow-hidden flex border border-white/5 p-[1px]">
          {measures.map((m, i) => (
            <div 
              key={i} 
              className={`flex-1 ${HIGHLIGHT_COLORS[m.status].accent} border-r border-black/20 last:border-0 opacity-60 hover:opacity-100 transition-opacity cursor-help`}
              title={`마디 ${m.id}: ${HIGHLIGHT_COLORS[m.status].label}`}
            ></div>
          ))}
        </div>
        
        {/* Legend */}
        <div className="flex gap-4 justify-center pt-2">
          {Object.entries(HIGHLIGHT_COLORS).map(([key, value]) => (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${value.accent}`}></div>
              <span className="text-[9px] text-gray-500">{value.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Focus Measures Detail */}
      {focusMeasures.length > 0 && (
        <div className="bg-[#1B1C26] rounded-2xl p-6 border border-[#FF6B6B]/20">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-[#FF6B6B]/10 flex items-center justify-center text-[#FF6B6B] border border-[#FF6B6B]/20 shadow-[0_0_15px_rgba(255,107,107,0.1)]">
              <Info size={20} />
            </div>
            <div>
              <h4 className="text-sm font-black text-white">
                중점 수정 마디 (M.{focusMeasures[0]} - M.{focusMeasures[focusMeasures.length - 1]})
              </h4>
              <p className="text-[10px] text-gray-500">Chorus 진입부에서 타이밍 실수가 집중되었습니다.</p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            {focusMeasures.map(id => (
              <div 
                key={id} 
                className="bg-white/5 border border-white/5 rounded-xl p-4 flex flex-col gap-3 group hover:bg-[#FF6B6B]/5 hover:border-[#FF6B6B]/30 transition-all cursor-pointer"
              >
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono text-white/30 italic">Measure {id}</span>
                  <span className="text-[9px] font-black text-[#FF6B6B] bg-[#FF6B6B]/10 px-2 py-0.5 rounded uppercase tracking-tighter">Delay</span>
                </div>
                <div className="w-full flex flex-col gap-[3px] opacity-40">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-[1px] bg-[#FF6B6B] w-full"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ScoreSection;
