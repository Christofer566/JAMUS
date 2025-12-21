import { create } from 'zustand';

interface RecordingRange {
  startTime: number;
  endTime: number;
  startMeasure: number;
  endMeasure: number;
}

interface RecordingState {
  audioBlob: Blob | null;
  recordingRange: RecordingRange | null;
  prerollDuration: number; // blob 앞부분 건너뛸 시간 (초)
  setRecording: (blob: Blob, range: RecordingRange, prerollDuration?: number) => void;
  clearRecording: () => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  audioBlob: null,
  recordingRange: null,
  prerollDuration: 0,

  setRecording: (blob: Blob, range: RecordingRange, prerollDuration = 0) => {
    set({ audioBlob: blob, recordingRange: range, prerollDuration });
  },

  clearRecording: () => {
    set({ audioBlob: null, recordingRange: null, prerollDuration: 0 });
  },
}));

export default useRecordingStore;
