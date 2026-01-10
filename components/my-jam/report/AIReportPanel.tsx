'use client';

import React from 'react';
import ReportHeader from './ReportHeader';
import TotalScoreSection from './TotalScoreSection';
import AnalysisSection from './AnalysisSection';
import ScoreSection from './ScoreSection';
import InsightSection from './InsightSection';
import ActionSection from './ActionSection';

export interface AIReportPanelProps {
  isOpen: boolean;
  onClose: () => void;
  jamData: {
    jamName: string;
    songTitle: string;
    artist: string;
    recordedDate: string;
  };
  onPracticeAgain?: () => void;
}

const AIReportPanel: React.FC<AIReportPanelProps> = ({ 
  isOpen, 
  onClose, 
  jamData,
  onPracticeAgain 
}) => {
  const handlePracticeAgain = () => {
    if (onPracticeAgain) {
      onPracticeAgain();
    } else {
      console.log('Re-initiating practice mode...');
    }
  };

  return (
    <aside className={`absolute top-0 right-0 h-full bg-[#14151C] border-l border-white/10 transition-all duration-700 ease-in-out z-40 flex flex-col ${
      isOpen ? 'w-1/2 translate-x-0 opacity-100 shadow-[-20px_0_60px_rgba(0,0,0,0.5)]' : 'w-1/2 translate-x-full opacity-0'
    }`}>
      {/* Decorative Glow Line */}
      <div className="absolute top-0 left-0 w-[2px] h-full bg-gradient-to-b from-transparent via-[#3DDF85]/40 to-transparent shadow-[0_0_20px_rgba(61,223,133,0.3)] pointer-events-none"></div>

      <ReportHeader 
        onClose={onClose}
        jamName={jamData.jamName}
        songTitle={jamData.songTitle}
        artist={jamData.artist}
        recordedDate={jamData.recordedDate}
      />
      
      <div className="flex-1 overflow-y-auto p-8 space-y-12 scroll-smooth pb-40">
        {/* Section: Total Score */}
        <TotalScoreSection score={82.7} />

        {/* Section: Sectional & Range Analysis */}
        <div className="space-y-6">
          <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-1 italic">Performance Flow</h4>
          <AnalysisSection />
        </div>

        {/* Section: Score Heatmap */}
        <div className="space-y-4">
          <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-1 italic">Visual Heatmap</h4>
          <ScoreSection />
        </div>

        {/* Section: Correction Statistics & AI Suggestions */}
        <div className="space-y-6">
          <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-1 italic">AI Diagnostic Insight</h4>
          <InsightSection />
        </div>
      </div>

      {/* Section: Action Buttons */}
      <ActionSection 
        onClose={onClose}
        onPractice={handlePracticeAgain}
      />
    </aside>
  );
};

export default AIReportPanel;
