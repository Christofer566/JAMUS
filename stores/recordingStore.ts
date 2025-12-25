import { create } from 'zustand';
import { InputInstrument, OutputInstrument, DEFAULT_INPUT_INSTRUMENT, DEFAULT_OUTPUT_INSTRUMENT } from '@/types/instrument';

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
  inputInstrument: InputInstrument;
  outputInstrument: OutputInstrument;
  setRecording: (blob: Blob, range: RecordingRange, prerollDuration?: number, inputInstrument?: InputInstrument, outputInstrument?: OutputInstrument) => void;
  clearRecording: () => void;
}

export const useRecordingStore = create<RecordingState>((set) => ({
  audioBlob: null,
  recordingRange: null,
  prerollDuration: 0,
  inputInstrument: DEFAULT_INPUT_INSTRUMENT,
  outputInstrument: DEFAULT_OUTPUT_INSTRUMENT,

  setRecording: (blob: Blob, range: RecordingRange, prerollDuration = 0, inputInstrument = DEFAULT_INPUT_INSTRUMENT, outputInstrument = DEFAULT_OUTPUT_INSTRUMENT) => {
    set({ audioBlob: blob, recordingRange: range, prerollDuration, inputInstrument, outputInstrument });
  },

  clearRecording: () => {
    set({ audioBlob: null, recordingRange: null, prerollDuration: 0, inputInstrument: DEFAULT_INPUT_INSTRUMENT, outputInstrument: DEFAULT_OUTPUT_INSTRUMENT });
  },
}));

export default useRecordingStore;
