
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, ChevronRight, FileText, PlusCircle, MoreVertical, Trash2 } from 'lucide-react';
import { MyJamListProps, FilterType } from '@/types/my-jam';

/**
 * Section 3: 내 JAM (Final Version)
 * Case A의 데이터 구성(날짜 우측, 리포트 버튼 스타일) + Case B의 필터 탭 & 넉넉한 카드 크기.
 */
const MyJamList: React.FC<MyJamListProps> = ({
  jams,
  activeFilter,
  onFilterChange,
  onViewAll,
  onPlay,
  onViewReport,
  onCreateReport,
  onDelete,
}) => {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDeleteClick = (jamId: string) => {
    setOpenMenuId(null);
    setDeleteConfirmId(jamId);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmId) {
      onDelete(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };
  return (
    <div className="space-y-6">
      {/* Header with Case B Style Filter Buttons */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-[#A55EEA] rounded-full shadow-[0_0_12px_rgba(165,94,234,0.4)]"></div>
            <h3 className="text-xl font-black text-white tracking-tight">내 JAM</h3>
          </div>
          <div className="flex gap-2 p-1 bg-[#2A2B39] rounded-xl border border-white/10">
            {['All', 'Single', 'Multi'].map((f) => (
              <button
                key={f}
                onClick={() => onFilterChange(f as FilterType)}
                className={`px-4 py-1 text-[11px] font-bold rounded-lg transition-all ${
                  activeFilter === f ? 'bg-[#3DDF85] text-[#1B1C26]' : 'text-gray-400 hover:text-white'
                }`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <button onClick={onViewAll} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors">
          전체보기 <ChevronRight size={14} className="text-[#7BA7FF]" />
        </button>
      </div>

      {/* Vertical List (Case B Sizing + Case A Content) */}
      <div className="space-y-4">
        {jams.map((jam) => (
          <div 
            key={jam.id} 
            className="group flex items-center bg-[#14151C]/80 border border-white/5 rounded-2xl p-5 transition-all hover:bg-[#FFFFFF]/5 hover:border-[#3DDF85]/30"
          >
            {/* Left: Cover & Title (Case B Size) */}
            <div className="flex items-center gap-6 flex-1">
              <div className="relative h-16 w-16 flex-shrink-0 shadow-xl group-hover:scale-105 transition-transform duration-300">
                {jam.coverUrl ? (
                  <img
                    src={jam.coverUrl}
                    className="h-full w-full rounded-xl object-cover"
                    alt="Cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                <div className={`${jam.coverUrl ? 'hidden' : ''} h-full w-full rounded-xl bg-gradient-to-br from-[#3DDF85]/20 to-[#7BA7FF]/20 flex items-center justify-center`}>
                  <span className="text-xs text-gray-400 font-bold">JAM</span>
                </div>
                <button
                  onClick={() => onPlay(jam.id)}
                  className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"
                >
                  <Play size={20} fill="white" className="text-white" />
                </button>
              </div>
              <div className="min-w-0">
                <h4 className="text-md font-bold text-white group-hover:text-[#3DDF85] transition-colors truncate">
                  {jam.name || 'Untitled JAM'}
                </h4>
                <p className="text-xs text-gray-400 font-medium truncate">
                  {jam.title} - {jam.artist}
                </p>
              </div>
            </div>

            {/* Right Side: Case A Information Hierarchy */}
            <div className="flex items-center gap-8">
              {/* Recorded Date */}
              <div className="text-right hidden sm:block">
                <p className="text-[9px] text-gray-500 uppercase font-black tracking-widest">RECORDED ON</p>
                <p className="text-xs text-gray-300 font-medium">{jam.recordedAt}</p>
              </div>

              {/* Type Tag */}
              <span className={`px-4 py-1 rounded-full text-[10px] font-black tracking-widest border transition-all ${
                jam.type === 'Multi' 
                  ? 'bg-[#A55EEA]/10 text-[#A55EEA] border-[#A55EEA]/40' 
                  : 'bg-white/5 text-gray-400 border-white/10'
              }`}>
                {jam.type.toUpperCase()}
              </span>

              {/* Action Buttons (Case A Style) */}
              <div className="flex items-center gap-2 min-w-[140px] justify-end">
                {jam.hasReport ? (
                  <button
                    onClick={() => onViewReport(jam.id)}
                    className="flex items-center gap-2 bg-white text-[#1B1C26] px-5 py-2 rounded-full text-[11px] font-bold hover:bg-[#E0E0E0] transition-colors shadow-lg"
                  >
                    <FileText size={12} />
                    AI 리포트 보기
                  </button>
                ) : (
                  <button
                    onClick={() => onCreateReport(jam.id)}
                    className="flex items-center gap-2 border border-white/20 text-white px-5 py-2 rounded-full text-[11px] font-bold hover:bg-white/5 transition-colors"
                  >
                    <PlusCircle size={12} />
                    새 리포트 생성
                  </button>
                )}
              </div>

              {/* More Menu (⋮) */}
              <div className="relative" ref={openMenuId === jam.id ? menuRef : null}>
                <button
                  onClick={() => setOpenMenuId(openMenuId === jam.id ? null : jam.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <MoreVertical size={18} />
                </button>

                {/* Dropdown Menu */}
                {openMenuId === jam.id && (
                  <div className="absolute right-0 top-full mt-1 w-36 bg-[#2A2B39] border border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <button
                      onClick={() => handleDeleteClick(jam.id)}
                      className="w-full flex items-center gap-2 px-4 py-3 text-[#FF6B6B] hover:bg-[#FF6B6B]/10 transition-colors text-sm font-medium"
                    >
                      <Trash2 size={14} />
                      삭제하기
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1B1C26] border border-white/10 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-full bg-[#FF6B6B]/10 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} className="text-[#FF6B6B]" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">JAM 삭제</h3>
              <p className="text-sm text-gray-400">
                이 JAM을 삭제하시겠습니까?<br />
                삭제된 JAM은 복구할 수 없습니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="flex-1 py-3 rounded-xl bg-white/5 text-white font-medium hover:bg-white/10 transition-colors"
              >
                취소
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 py-3 rounded-xl bg-[#FF6B6B] text-white font-medium hover:bg-[#FF5555] transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyJamList;
