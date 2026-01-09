import { create } from 'zustand';

export interface CurrentJam {
  id: string;
  name: string | null;
  audioUrl: string;
  songTitle: string;
  songArtist: string;
  coverUrl: string | null;
  backingTrackUrl?: string; // M-05: 믹싱 재생용 backing track URL
}

interface PlayerState {
  currentJam: CurrentJam | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;

  // Actions
  playJam: (jam: CurrentJam) => void;
  togglePlay: () => void;
  setIsPlaying: (isPlaying: boolean) => void;
  updateTime: (time: number) => void;
  setDuration: (duration: number) => void;
  closePlayer: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  currentJam: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,

  playJam: (jam: CurrentJam) => {
    set({
      currentJam: jam,
      isPlaying: true,
      currentTime: 0,
      duration: 0
    });
  },

  togglePlay: () => {
    set((state) => ({ isPlaying: !state.isPlaying }));
  },

  setIsPlaying: (isPlaying: boolean) => {
    set({ isPlaying });
  },

  updateTime: (time: number) => {
    set({ currentTime: time });
  },

  setDuration: (duration: number) => {
    set({ duration });
  },

  closePlayer: () => {
    set({
      currentJam: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0
    });
  },
}));

export default usePlayerStore;
