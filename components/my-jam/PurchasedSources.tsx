
'use client';

import React from 'react';
import { ChevronRight, Music, Play, User } from 'lucide-react';
import { PurchasedSourcesProps, SortType } from '@/types/my-jam';

/**
 * Section 2: Purchased Sources (Final Version)
 * Combining Case B's immersive cards with Case A's pill-style sorting tabs (Korean).
 */
const PurchasedSources: React.FC<PurchasedSourcesProps> = ({
  sources,
  activeSort,
  onSortChange,
  onViewAll,
  onSourceClick,
}) => {
  const sortTabs: { id: SortType; label: string }[] = [
    { id: 'latest', label: '최근구매순' },
    { id: 'title', label: '제목순' },
    { id: 'artist', label: '아티스트순' },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Case A style Sorting Tabs */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-[#3DDF85] rounded-full shadow-[0_0_12px_rgba(61,223,133,0.6)]"></div>
            <h3 className="text-xl font-black text-white tracking-tight">내가 구매한 소스</h3>
          </div>
          <div className="flex bg-[#FFFFFF]/5 rounded-full p-1 border border-white/10">
            {sortTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onSortChange(tab.id)}
                className={`px-4 py-1.5 text-[11px] font-medium rounded-full transition-all ${
                  activeSort === tab.id 
                    ? 'bg-white text-[#1B1C26]' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <button 
          onClick={onViewAll}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
        >
          전체보기 <ChevronRight size={14} className="text-[#3DDF85]" />
        </button>
      </div>

      {/* Grid List with Case B Immersive Cards */}
      <div className="grid grid-cols-2 gap-6">
        {sources.map((source) => (
          <div 
            key={source.id} 
            className="group relative bg-[#2A2B39]/40 backdrop-blur-md rounded-2xl border border-white/10 overflow-hidden flex transition-all duration-300 hover:border-[#3DDF85]/50 hover:[box-shadow:0_0_32px_rgba(61,223,133,0.1)]"
          >
            {/* Hover Action Layer */}
            <div className="absolute inset-0 z-30 opacity-0 group-hover:opacity-100 bg-gradient-to-t from-[#1B1C26] to-transparent flex flex-col items-center justify-center transition-opacity">
                <button
                  onClick={() => onSourceClick?.(source.id)}
                  className="flex items-center gap-2 bg-[#3DDF85] text-[#1B1C26] px-8 py-2 rounded-full font-black text-xs shadow-xl shadow-[#3DDF85]/20 transform scale-90 group-hover:scale-100 transition-transform"
                >
                  <Play size={14} fill="currentColor" />
                  JAMUS
                </button>
            </div>

            {/* Cover Image */}
            <div className="relative h-full w-[100px] flex-shrink-0">
               <img src={source.coverUrl} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" alt="Cover" />
               <div className="absolute inset-0 bg-black/20"></div>
               <div className="absolute bottom-2 left-2 p-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                  <Music size={12} className="text-[#3DDF85]" />
               </div>
            </div>
            
            {/* Information */}
            <div className="p-4 flex flex-col justify-center flex-1 overflow-hidden">
               <h4 className="text-md font-bold text-white truncate mb-1 group-hover:text-[#3DDF85] transition-colors">{source.title}</h4>
               <p className="text-xs text-gray-400 font-medium truncate mb-3">{source.artist}</p>
               <div className="mt-auto flex items-center gap-2 border-t border-white/5 pt-3">
                  <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                    <User size={10} className="text-gray-400" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter truncate">Sold by {source.seller}</span>
               </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PurchasedSources;
