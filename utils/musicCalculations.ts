import { TimeSignature, StructureData, ProgressSection, MusicCalculationResult } from '@/types/music';

/**
 * 박자표에서 한 마디의 박자 수 추출
 */
export function getBeatsPerMeasure(timeSignature: TimeSignature): number {
    // 6/8박자 설명:
    // 재즈 스탠다드에서는 6/8을 2박(점4분음표 2개)으로 세는 경우가 많음 (Compound Duple Meter).
    // BPM이 점4분음표 기준이라고 가정하면 2박이 됨.
    const map: Record<TimeSignature, number> = {
        '4/4': 4,
        '3/4': 3,
        '6/8': 2,
        '2/4': 2,
        '5/4': 5,
    };
    return map[timeSignature] || 4;
}

/**
 * 한 마디의 지속 시간 계산 (초 단위)
 * 공식: measureDuration = (60 / BPM) × beatsPerMeasure
 * 예: BPM 120, 4/4박자 → (60 / 120) × 4 = 2초
 */
export function calculateMeasureDuration(
    bpm: number,
    timeSignature: TimeSignature
): number {
    const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
    const secondsPerBeat = 60 / bpm;
    return secondsPerBeat * beatsPerMeasure;
}

/**
 * 특정 마디의 시작 시간 계산 (초 단위)
 */
export function getMeasureStartTime(
    measureNumber: number,
    measureDuration: number
): number {
    return (measureNumber - 1) * measureDuration;
}

/**
 * 현재 재생 시간에서 마디 번호 계산
 */
export function getCurrentMeasure(
    currentTime: number,
    measureDuration: number
): number {
    if (measureDuration === 0) return 1;
    return Math.floor(currentTime / measureDuration) + 1;
}

/**
 * N개 마디 뒤/앞으로 이동했을 때의 시간 계산
 */
export function seekByMeasures(
    currentTime: number,
    measureOffset: number,
    measureDuration: number,
    totalDuration: number
): number {
    const currentMeasure = getCurrentMeasure(currentTime, measureDuration);
    const targetMeasure = currentMeasure + measureOffset;

    // 1마디 미만으로 가면 0초(1마디 시작)로
    if (targetMeasure < 1) return 0;

    let targetTime = getMeasureStartTime(targetMeasure, measureDuration);

    // 전체 길이를 초과하면 전체 길이로 제한 (또는 마지막 마디 시작으로 제한할 수도 있음)
    // 여기서는 전체 길이로 제한
    targetTime = Math.max(0, Math.min(targetTime, totalDuration));

    return targetTime;
}

/**
 * structure_data로부터 progressSections 동적 생성
 */
export function generateProgressSections(
    structureData: StructureData,
    measureDuration: number
): ProgressSection[] {
    if (!structureData || !structureData.sections) return [];

    const sections: ProgressSection[] = [];

    structureData.sections.forEach((section) => {
        const startTime = getMeasureStartTime(section.startMeasure, measureDuration);
        sections.push({
            value: startTime,
            label: section.label,
        });
    });

    return sections;
}

/**
 * 종합 계산 함수
 */
export function calculateMusicMetrics(
    currentTime: number,
    bpm: number,
    timeSignature: TimeSignature,
    duration: number,
    structureData: StructureData
): MusicCalculationResult {
    const measureDuration = calculateMeasureDuration(bpm, timeSignature);
    const beatsPerMeasure = getBeatsPerMeasure(timeSignature);
    const currentMeasure = getCurrentMeasure(currentTime, measureDuration);
    const progressSections = generateProgressSections(structureData, measureDuration);

    return {
        measureDuration,
        beatsPerMeasure,
        currentMeasure,
        totalMeasures: structureData.totalMeasures,
        progressSections,
    };
}
