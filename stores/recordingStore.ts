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
  setRecording: (blob: Blob, range: RecordingRange) => void;
  clearRecording: () => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  audioBlob: null,
  recordingRange: null,

  setRecording: (blob: Blob, range: RecordingRange) => {
    set({ audioBlob: blob, recordingRange: range });
  },

  clearRecording: () => {
    set({ audioBlob: null, recordingRange: null });
  },
}));

export default useRecordingStore;
