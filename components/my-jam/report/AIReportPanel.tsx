'use client';

import React from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAIReport } from '@/hooks/useAIReport';
import { useReportPanelStore } from '@/stores/reportPanelStore';
import ReportHeader from './ReportHeader';
import TotalScoreSection from './TotalScoreSection';
import AnalysisSection from './AnalysisSection';
import ScoreSection from './ScoreSection';
import ReportMiniScore from './ReportMiniScore';
import InsightSection from './InsightSection';
import ActionSection from './ActionSection';

export interface AIReportPanelProps {
  onPracticeAgain?: (songId: string) => void;
}

const AIReportPanel: React.FC<AIReportPanelProps> = ({ onPracticeAgain }) => {
  const {
    isOpen,
    currentJamId,
    currentSongId,
    reportData,
    isLoading,
    error,
  } = useReportPanelStore();

  const { closePanel } = useAIReport();

  const handlePracticeAgain = () => {
    if (onPracticeAgain && currentSongId) {
      onPracticeAgain(currentSongId);
    } else {
      console.log('Re-initiating practice mode...');
    }
  };

  // 로딩 상태
  const renderLoading = () => (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
      <Loader2 className="w-8 h-8 animate-spin mb-4" />
      <p>리포트 데이터를 분석 중...</p>
    </div>
  );

  // 에러 상태
  const renderError = () => (
    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8">
      <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
      <p className="text-red-400 font-bold mb-2">리포트를 불러올 수 없습니다</p>
      <p className="text-sm text-center">{error}</p>
      <button
        onClick={closePanel}
        className="mt-6 px-6 py-2 bg-white/10 rounded-full text-sm hover:bg-white/20 transition-colors"
      >
        닫기
      </button>
    </div>
  );

  // 리포트 콘텐츠
  const renderContent = () => {
    if (!reportData) return null;

    // InsightSection용 데이터 변환
    const editStats = {
      totalNotes: reportData.editStats.totalNotes,
      editedNotes: reportData.editStats.editedNotes,
      pitchEdits: reportData.editStats.pitchEdits,
      timingEdits: reportData.editStats.timingEdits,
      lengthEdits: reportData.editStats.durationEdits,
    };

    // suggestions 변환 (type 매핑)
    const suggestions = reportData.suggestions.map((s) => ({
      type: s.type === 'system_limit' ? 'system' as const
          : s.type === 'user_error' ? 'user' as const
          : 'positive' as const,
      title: s.title,
      desc: s.description,
    }));

    // ScoreSection/ReportMiniScore용 measures 데이터 변환 (V-06, V-07)
    // measureAnalysis 기반으로 총 마디 수 계산
    const totalMeasures = reportData.measureAnalysis.length > 0
      ? Math.max(...reportData.measureAnalysis.map(m => m.measureEnd + 1))
      : 16;

    const measures = Array.from({ length: totalMeasures }, (_, i) => {
      const measureIndex = i;
      const problemArea = reportData.problemAreas.find(
        (p) => measureIndex >= p.measureStart && measureIndex <= p.measureEnd
      );
      return {
        id: i + 1,
        status: problemArea?.type || 'accurate' as const,
      };
    });

    // AnalysisSection용 sectionalData 변환 (V-08)
    const sectionalData = reportData.measureAnalysis.map((m) => ({
      label: `M. ${m.measureStart + 1}-${m.measureEnd + 1}`,
      value: m.accuracy,
      status: m.accuracy >= 70 ? 'good' as const : 'warning' as const,
    }));

    // AnalysisSection용 rangeData 변환 (V-09)
    const rangeData = [
      {
        label: '저음역',
        range: reportData.rangeAnalysis.low.range,
        value: reportData.rangeAnalysis.low.accuracy,
        color: '#FF6B6B',
      },
      {
        label: '중음역',
        range: reportData.rangeAnalysis.mid.range,
        value: reportData.rangeAnalysis.mid.accuracy,
        color: '#7BA7FF',
      },
      {
        label: '고음역',
        range: reportData.rangeAnalysis.high.range,
        value: reportData.rangeAnalysis.high.accuracy,
        color: '#3DDF85',
      },
    ];

    return (
      <>
        <div className="flex-1 overflow-y-auto p-8 space-y-12 scroll-smooth pb-40">
          {/* Section: Total Score */}
          <TotalScoreSection
            score={reportData.overallScore}
            pitchScore={reportData.pitchAccuracy}
            timingScore={reportData.timingAccuracy}
            dynamicsScore={reportData.durationAccuracy}
            recoveryScore={reportData.recoveryRate}
          />

          {/* Section: Score Overview (V-06, V-07) */}
          <ReportMiniScore
            measures={measures}
            totalMeasures={measures.length}
          />

          {/* Section: Sectional & Range Analysis */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-1 italic">
              Performance Flow
            </h4>
            <AnalysisSection
              sectionalData={sectionalData.length > 0 ? sectionalData : undefined}
              rangeData={rangeData}
            />
          </div>

          {/* Section: Score Heatmap */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-1 italic">
              Visual Heatmap
            </h4>
            <ScoreSection measures={measures} />
          </div>

          {/* Section: Correction Statistics & AI Suggestions */}
          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-1 italic">
              AI Diagnostic Insight
            </h4>
            <InsightSection
              editStats={editStats}
              suggestions={suggestions.length > 0 ? suggestions : undefined}
            />
          </div>
        </div>

        {/* Section: Action Buttons */}
        <ActionSection onClose={closePanel} onPractice={handlePracticeAgain} />
      </>
    );
  };

  return (
    <aside
      className={`absolute top-0 right-0 h-full bg-[#14151C] border-l border-white/10 transition-all duration-700 ease-in-out z-40 flex flex-col ${
        isOpen
          ? 'w-1/2 translate-x-0 opacity-100 shadow-[-20px_0_60px_rgba(0,0,0,0.5)]'
          : 'w-1/2 translate-x-full opacity-0 pointer-events-none'
      }`}
    >
      {/* Decorative Glow Line */}
      <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-transparent via-[#3DDF85]/40 to-transparent shadow-[0_0_20px_rgba(61,223,133,0.3)] pointer-events-none"></div>

      {/* Header - 항상 표시 */}
      <ReportHeader
        onClose={closePanel}
        jamName={reportData?.jamId ? `JAM Report` : 'AI Report'}
        songTitle={currentSongId || ''}
        artist=""
        recordedDate={reportData?.calculatedAt?.split('T')[0] || ''}
      />

      {/* Content */}
      {isLoading && renderLoading()}
      {error && !isLoading && renderError()}
      {reportData && !isLoading && !error && renderContent()}
    </aside>
  );
};

export default AIReportPanel;
