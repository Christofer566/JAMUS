'use client';

import React from 'react';

type MeasureStatus = 'accurate' | 'user_error' | 'system_limit' | 'unconfirmed';

interface MeasureData {
  id: number;
  status: MeasureStatus;
}

interface ReportMiniScoreProps {
  measures?: MeasureData[];
  totalMeasures?: number;
}

// 상태별 색상 정의 (V-07: 시스템 한계=회색, 사용자 실수=빨간, 정확=초록)
const STATUS_COLORS: Record<MeasureStatus, { bg: string; border: string; glow: string }> = {
  accurate: {
    bg: 'bg-[#3DDF85]/30',
    border: 'border-[#3DDF85]/60',
    glow: 'shadow-[0_0_8px_rgba(61,223,133,0.3)]'
  },
  user_error: {
    bg: 'bg-[#FF6B6B]/30',
    border: 'border-[#FF6B6B]/60',
    glow: 'shadow-[0_0_8px_rgba(255,107,107,0.3)]'
  },
  system_limit: {
    bg: 'bg-[#9B9B9B]/30',
    border: 'border-[#9B9B9B]/60',
    glow: ''
  },
  unconfirmed: {
    bg: 'bg-[#F2C94C]/30',
    border: 'border-[#F2C94C]/60',
    glow: 'shadow-[0_0_8px_rgba(242,201,76,0.2)]'
  },
};

const STATUS_LABELS: Record<MeasureStatus, string> = {
  accurate: '정확',
  user_error: '사용자 실수',
  system_limit: 'AI 한계',
  unconfirmed: '미확인',
};

const defaultMeasures: MeasureData[] = Array.from({ length: 16 }, (_, i) => ({
  id: i + 1,
  status: 'accurate' as MeasureStatus,
}));

const ReportMiniScore: React.FC<ReportMiniScoreProps> = ({
  measures = defaultMeasures,
  totalMeasures = 16,
}) => {
  // 4마디씩 줄로 분할
  const rows: MeasureData[][] = [];
  for (let i = 0; i < measures.length; i += 4) {
    rows.push(measures.slice(i, i + 4));
  }

  // 5개 오선 라인 렌더링
  const renderStaffLines = () => (
    <div className="absolute inset-0 flex flex-col justify-center pointer-events-none">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-[1px] bg-white/10 w-full"
          style={{ marginBottom: i < 4 ? '6px' : 0 }}
        />
      ))}
    </div>
  );

  // 각 마디 렌더링
  const renderMeasure = (measure: MeasureData, isLast: boolean) => {
    const colors = STATUS_COLORS[measure.status];

    return (
      <div
        key={measure.id}
        className={`relative flex-1 h-full ${colors.bg} ${colors.glow} border-l border-white/10 ${isLast ? 'border-r' : ''} group cursor-help transition-all hover:brightness-125`}
        title={`마디 ${measure.id}: ${STATUS_LABELS[measure.status]}`}
      >
        {/* 마디 번호 */}
        <span className="absolute top-1 left-1 text-[8px] font-mono text-white/30">
          {measure.id}
        </span>

        {/* 상태 아이콘 (호버 시 표시) */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className={`w-3 h-3 rounded-full ${colors.bg} ${colors.border} border-2`} />
        </div>

        {/* 오선 */}
        {renderStaffLines()}

        {/* 노트 표현 (상태에 따른 시각화) */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {measure.status === 'accurate' && (
            <div className="w-2 h-2 rounded-full bg-[#3DDF85]/60" />
          )}
          {measure.status === 'user_error' && (
            <div className="w-2 h-2 rounded-full bg-[#FF6B6B]/80 animate-pulse" />
          )}
          {measure.status === 'system_limit' && (
            <div className="w-2 h-2 rounded-sm bg-[#9B9B9B]/60 rotate-45" />
          )}
          {measure.status === 'unconfirmed' && (
            <div className="w-2 h-2 rounded-full border border-[#F2C94C]/80 border-dashed" />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 악보 헤더 */}
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
          Score Overview
        </h4>
        <span className="text-[9px] text-gray-500 font-mono">
          {totalMeasures} measures
        </span>
      </div>

      {/* 악보 시각화 */}
      <div className="bg-[#0D0E12] rounded-2xl border border-white/5 p-4 space-y-2">
        {/* 클레프 + 조표 영역 (시각적 요소) */}
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/5">
          <span className="text-lg text-white/20">𝄞</span>
          <span className="text-[9px] text-white/30 font-mono uppercase tracking-wider">
            Performance Analysis
          </span>
        </div>

        {/* 마디별 줄 렌더링 */}
        {rows.map((row, rowIndex) => (
          <div
            key={rowIndex}
            className="flex h-10 bg-[#14151C]/50 rounded-lg overflow-hidden border border-white/5"
          >
            {row.map((measure, idx) =>
              renderMeasure(measure, idx === row.length - 1)
            )}
          </div>
        ))}

        {/* 범례 */}
        <div className="flex flex-wrap gap-3 justify-center pt-3 border-t border-white/5">
          {Object.entries(STATUS_LABELS).map(([key, label]) => {
            const colors = STATUS_COLORS[key as MeasureStatus];
            return (
              <div key={key} className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${colors.bg} ${colors.border} border`} />
                <span className="text-[9px] text-gray-500">{label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ReportMiniScore;
