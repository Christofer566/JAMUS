/**
 * 악기 및 변환 관련 타입 정의
 */

// 입력 악기 타입 (메타데이터용)
export type InputInstrument = 'voice' | 'piano' | 'guitar';

// 출력 악기 타입 (변환용)
export type OutputInstrument = 'raw' | 'piano' | 'guitar';

// 변환 상태
export interface ConversionState {
  isConverting: boolean;
  progress: number;  // 0-100
  error: string | null;
  convertedAudioUrl: string | null;
  isFallbackMode: boolean;  // 폴백 모드 (Tone.js) 사용 여부
}

// 악기 옵션 (드롭다운용)
export interface InstrumentOption {
  value: string;
  label: string;
  emoji: string;
}

// INPUT 옵션 목록
export const INPUT_INSTRUMENT_OPTIONS: InstrumentOption[] = [
  { value: 'voice', label: '목소리', emoji: '🎤' },
  { value: 'piano', label: '피아노', emoji: '🎹' },
  { value: 'guitar', label: '기타', emoji: '🎸' },
];

// OUTPUT 옵션 목록
export const OUTPUT_INSTRUMENT_OPTIONS: InstrumentOption[] = [
  { value: 'raw', label: '녹음 원본', emoji: '🎤' },
  { value: 'piano', label: '피아노', emoji: '🎹' },
  { value: 'guitar', label: '기타', emoji: '🎸' },
];

// 기본값
export const DEFAULT_INPUT_INSTRUMENT: InputInstrument = 'voice';
export const DEFAULT_OUTPUT_INSTRUMENT: OutputInstrument = 'raw';

// 변환 상태 초기값
export const INITIAL_CONVERSION_STATE: ConversionState = {
  isConverting: false,
  progress: 0,
  error: null,
  convertedAudioUrl: null,
  isFallbackMode: false,
};
