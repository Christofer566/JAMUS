import { NoteData } from '@/types/note';

interface DistributeOptions {
  bpm: number;
  beatsPerMeasure: number;
  startMeasure: number;
}

/**
 * 연속된 음표 데이터를 마디별로 분배
 * @param notes - 음표 배열 (startBeat 기준 정렬되어 있어야 함)
 * @param options - bpm, beatsPerMeasure, startMeasure
 * @returns 마디 번호를 키로 하는 음표 배열 맵
 */
export function distributeNotesToMeasures(
  notes: NoteData[],
  options: DistributeOptions
): Record<number, NoteData[]> {
  const { beatsPerMeasure, startMeasure } = options;
  const result: Record<number, NoteData[]> = {};

  for (const note of notes) {
    // 쉼표는 제외
    if (note.isRest) continue;

    // 음표가 속하는 마디 계산
    const measureIndex = Math.floor(note.startBeat / beatsPerMeasure);
    const measureNumber = startMeasure + measureIndex;

    // 마디 배열 초기화
    if (!result[measureNumber]) {
      result[measureNumber] = [];
    }

    // 마디 내 상대적 startBeat 계산
    const relativeStartBeat = note.startBeat % beatsPerMeasure;

    result[measureNumber].push({
      ...note,
      startBeat: relativeStartBeat
    });
  }

  return result;
}

export default distributeNotesToMeasures;
