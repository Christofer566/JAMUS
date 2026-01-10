import { create } from 'zustand';
import { AIReportData } from '@/types/ai-report';

interface ReportPanelState {
  // 패널 상태
  isOpen: boolean;
  currentJamId: string | null;
  currentSongId: string | null;

  // 리포트 데이터
  reportData: AIReportData | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  openPanel: (jamId: string, songId: string) => void;
  closePanel: () => void;
  setReportData: (data: AIReportData | null) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  isOpen: false,
  currentJamId: null,
  currentSongId: null,
  reportData: null,
  isLoading: false,
  error: null,
};

export const useReportPanelStore = create<ReportPanelState>((set) => ({
  ...initialState,

  openPanel: (jamId: string, songId: string) => {
    set({
      isOpen: true,
      currentJamId: jamId,
      currentSongId: songId,
      reportData: null,
      isLoading: true,
      error: null,
    });
  },

  closePanel: () => {
    set({
      isOpen: false,
      // 데이터는 유지 (다시 열 때 캐시로 사용 가능)
    });
  },

  setReportData: (data: AIReportData | null) => {
    set({
      reportData: data,
      isLoading: false,
      error: null,
    });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setError: (error: string | null) => {
    set({
      error,
      isLoading: false,
    });
  },

  reset: () => {
    set(initialState);
  },
}));

export default useReportPanelStore;
