'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

interface SelectedRange {
  start: number;
  end: number;
}

interface Bounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface SheetMusicModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedRange: SelectedRange | null;
  position: Bounds | null;
}

export default function SheetMusicModal({
  isOpen,
  onClose,
  selectedRange,
  position,
}: SheetMusicModalProps) {
  
  // Comprehensive scroll lock effect
  useEffect(() => {
    if (isOpen) {
      const originalBodyStyle = document.body.style.cssText;
      const originalHtmlStyle = document.documentElement.style.cssText;
      const scrollY = window.scrollY;
      const scrollX = window.scrollX;

      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = `-${scrollX}px`;
      document.body.style.width = '100%';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100%';

      const preventDefault = (e: Event) => {
        e.preventDefault();
      };

      const preventKeyboardScroll = (e: KeyboardEvent) => {
        if (['ArrowUp', 'ArrowDown', 'Space', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.code)) {
          e.preventDefault();
        }
      };

      document.addEventListener('wheel', preventDefault, { passive: false });
      document.addEventListener('touchmove', preventDefault, { passive: false });
      document.addEventListener('keydown', preventKeyboardScroll, { passive: false });

      return () => {
        document.body.style.cssText = originalBodyStyle;
        document.documentElement.style.cssText = originalHtmlStyle;
        window.scrollTo(scrollX, scrollY);
        
        document.removeEventListener('wheel', preventDefault);
        document.removeEventListener('touchmove', preventDefault);
        document.removeEventListener('keydown', preventKeyboardScroll);
      };
    }
  }, [isOpen]);

  // ESC key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Click outside handler
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const popup = document.getElementById('sheet-music-popup');
      const closeButton = document.getElementById('sheet-music-popup-close-button');
      
      if (popup && !popup.contains(e.target as Node) && (!closeButton || !closeButton.contains(e.target as Node))) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);
  
  if (!isOpen || !position) return null;
  
  const modalContent = (
    <>
      <div
        id="sheet-music-popup"
        className="fixed z-50 bg-[#1B1C26]/98 rounded-lg border-2 border-[#7BA7FF] shadow-2xl"
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
          width: `${position.width}px`,
          height: `${position.height}px`,
        }}
      >
        <div className="w-full h-full flex items-center justify-center p-8">
          <p className="text-[#9B9B9B] text-sm text-center">
            Sheet Music Rendering Area
          </p>
        </div>
      </div>
      <button
        id="sheet-music-popup-close-button"
        onClick={onClose}
        className="fixed w-8 h-8 flex items-center justify-center text-white bg-[#9B9B9B]/70 hover:bg-[#7BA7FF] rounded-full transition-all duration-200 z-[60] shadow-lg"
        style={{
          left: `${position.left + position.width + 8}px`,
          top: `${position.top}px`,
          zIndex: 60
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 4L4 12M4 4L12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </svg>
      </button>
    </>
  );

  return createPortal(modalContent, document.body);
}