// components/single/feedback/EditToolPanel.tsx
'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Undo, Redo, RotateCcw, ChevronLeft, Check, Pin } from 'lucide-react';

interface EditToolPanelProps {
  onClose: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  onConfirm: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const EditToolPanel: React.FC<EditToolPanelProps> = ({ onClose, onUndo, onRedo, onReset, onConfirm, canUndo, canRedo }) => {
  const [isHelpVisible, setIsHelpVisible] = useState(false);
  const [isHelpPinned, setIsHelpPinned] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  // 버튼 위치에 따라 툴팁 위치 계산
  useEffect(() => {
    if ((isHelpVisible || isHelpPinned) && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setTooltipPosition({
        top: rect.top + rect.height / 2,
        left: rect.right + 8
      });
    }
  }, [isHelpVisible, isHelpPinned]);

  const buttonStyle = "bg-white/10 hover:bg-white/20 text-white rounded px-3 py-2 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:pointer-events-none text-sm";

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 select-none relative overflow-visible">
      {/* 인라인 편집 도구 */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* 일반모드 버튼 */}
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors text-sm"
        >
          <ChevronLeft size={16} />
          <span>일반모드</span>
        </button>

        <div className="w-px h-7 bg-white/20" />

        {/* Undo/Redo/Reset */}
        <button onClick={onUndo} disabled={!canUndo} className={buttonStyle}>
          <Undo size={16} />
          이전
        </button>
        <button onClick={onRedo} disabled={!canRedo} className={buttonStyle}>
          <Redo size={16} />
          이후
        </button>
        <button onClick={onReset} className={buttonStyle}>
          <RotateCcw size={16} />
          리셋
        </button>

        <div className="w-px h-7 bg-white/20" />

        {/* 확인 버튼 */}
        <button
          onClick={onConfirm}
          className="px-5 py-2 bg-[#7BA7FF] hover:bg-[#5A8FFF] text-white rounded-lg flex items-center gap-2 font-semibold transition-colors text-sm"
        >
          <Check size={16} />
          편집 확정
        </button>

        {/* 조작안내 버튼 */}
        <div className="ml-auto relative">
          <button
            ref={buttonRef}
            onMouseEnter={() => !isHelpPinned && setIsHelpVisible(true)}
            onMouseLeave={() => !isHelpPinned && setIsHelpVisible(false)}
            onClick={() => setIsHelpPinned(!isHelpPinned)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg transition-colors text-sm ${
              isHelpPinned
                ? 'bg-[#7BA7FF]/20 text-[#7BA7FF]'
                : 'hover:bg-white/10 text-gray-400 hover:text-white'
            }`}
            title={isHelpPinned ? '고정 해제' : '클릭하여 고정'}
          >
            <Pin size={16} className={isHelpPinned ? '' : 'rotate-45'} />
            <span>조작안내</span>
          </button>

          {/* 조작안내 툴팁 - 오른쪽에 표시 (fixed 포지션으로 잘림 방지) */}
          {(isHelpVisible || isHelpPinned) && (
            <div
              className="z-[100] bg-[#1B1C26] border border-white/20 rounded-lg p-4 shadow-2xl min-w-[220px]"
              style={{
                position: 'fixed',
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`,
                transform: 'translateY(-50%)'
              }}
              onMouseEnter={() => setIsHelpVisible(true)}
              onMouseLeave={() => !isHelpPinned && setIsHelpVisible(false)}
            >
              <h4 className="font-bold text-white text-sm mb-3">📌 조작 안내</h4>
              <ul className="space-y-1.5 text-xs text-gray-400">
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">↑↓</span> 음정 (반음)</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">←→</span> 위치 (슬롯)</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">Shift+←→</span> 길이</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">끝점 드래그</span> 길이</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">중앙 드래그</span> 위치</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">Delete</span> 삭제</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">Ctrl+클릭</span> 다중선택</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">영역드래그</span> 범위선택</li>
                <li><span className="font-mono bg-white/10 px-1.5 py-0.5 rounded">ESC</span> 선택해제</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EditToolPanel;
