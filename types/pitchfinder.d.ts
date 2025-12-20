declare module 'pitchfinder' {
  interface PitchDetectorOptions {
    sampleRate?: number;
    cutoff?: number;
    probabilityThreshold?: number;
    threshold?: number;
  }

  type PitchDetector = (buffer: Float32Array) => number | null;

  export function MacLeod(options?: PitchDetectorOptions): PitchDetector;
  export function YIN(options?: PitchDetectorOptions): PitchDetector;
  export function AMDF(options?: PitchDetectorOptions): PitchDetector;
  export function ACF(options?: PitchDetectorOptions): PitchDetector;
  export function DynamicWavelet(options?: PitchDetectorOptions): PitchDetector;
}
