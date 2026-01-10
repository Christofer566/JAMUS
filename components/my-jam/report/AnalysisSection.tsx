'use client';

import React, { useState } from 'react';
import { Activity, Layers } from 'lucide-react';

interface SectionalData {
  label: string;
  value: number;
  status: 'good' | 'warning';
}

interface RangeData {
  label: string;
  range: string;
  value: number;
  color: string;
}

interface AnalysisSectionProps {
  sectionalData?: SectionalData[];
  rangeData?: RangeData[];
}

const defaultSectionalData: SectionalData[] = [
  { label: 'M. 1-4', value: 85, status: 'good' },
  { label: 'M. 5-8', value: 62, status: 'warning' },
  { label: 'M. 9-12', value: 95, status: 'good' },
  { label: 'M. 13-16', value: 88, status: 'good' },
];

const defaultRangeData: RangeData[] = [
  { label: '저음역', range: 'D2-G2', value: 72, color: '#FF6B6B' },
  { label: '중음역', range: 'A2-D3', value: 89, color: '#7BA7FF' },
  { label: '고음역', range: 'E3-C4', value: 85, color: '#3DDF85' },
];

const AnalysisSection: React.FC<AnalysisSectionProps> = ({ 
  sectionalData = defaultSectionalData,
  rangeData = defaultRangeData
}) => {
  const [activeTab, setActiveTab] = useState<'section' | 'range'>('section');

  return (
    <div className="bg-[#14151C] rounded-[32px] border border-white/10 overflow-hidden shadow-2xl">
      <div className="flex bg-white/5 p-1.5 m-4 rounded-2xl border border-white/5">
        <button 
          onClick={() => setActiveTab('section')}
          className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'section' 
              ? 'bg-[#3DDF85] text-[#1B1C26] shadow-lg' 
              : 'text-gray-500 hover:text-white'
          }`}
        >
          <Layers size={12} /> Sectional
        </button>
        <button 
          onClick={() => setActiveTab('range')}
          className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
            activeTab === 'range' 
              ? 'bg-[#3DDF85] text-[#1B1C26] shadow-lg' 
              : 'text-gray-500 hover:text-white'
          }`}
        >
          <Activity size={12} /> Pitch Range
        </button>
      </div>

      <div className="p-8 min-h-[300px] flex flex-col justify-center">
        {activeTab === 'section' ? (
          <div className="grid grid-cols-2 gap-4">
            {sectionalData.map((d) => (
              <div 
                key={d.label} 
                className="group relative bg-black/40 p-5 rounded-2xl border border-white/5 transition-all hover:border-white/20"
              >
                <span className="text-[10px] font-mono text-gray-600 block mb-2">{d.label}</span>
                <div className="flex items-end justify-between">
                  <span className={`text-2xl font-black italic tracking-tighter ${
                    d.status === 'warning' ? 'text-[#FF6B6B]' : 'text-white'
                  }`}>
                    {d.value}<span className="text-[10px] not-italic opacity-50 ml-0.5">%</span>
                  </span>
                  <div className="flex gap-1 h-8 items-end">
                    {[1, 2, 3, 4, 5].map(i => (
                      <div 
                        key={i} 
                        className={`w-1 rounded-full transition-all ${
                          i * 20 <= d.value 
                            ? (d.status === 'warning' ? 'bg-[#FF6B6B]' : 'bg-[#3DDF85]') 
                            : 'bg-white/5'
                        }`} 
                        style={{ height: `${20 + i * 15}%` }}
                      ></div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {rangeData.map((d) => (
              <div key={d.label} className="flex items-center gap-6">
                <div className="w-24 shrink-0">
                  <h6 className="text-xs font-black text-white">{d.label}</h6>
                  <p className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">{d.range}</p>
                </div>
                <div className="flex-1 h-3 bg-black/60 rounded-full p-[2px] border border-white/5 overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000" 
                    style={{ width: `${d.value}%`, backgroundColor: d.color }}
                  ></div>
                </div>
                <div className="w-12 text-right">
                  <span className="text-sm font-black italic" style={{ color: d.color }}>{d.value}%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisSection;
