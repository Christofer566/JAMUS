import { TimeSignature, StructureData, ProgressSection, MusicCalculationResult } from '@/types/music';

/**
 * 박자표에서 한 마디의 박자 수 추출
 */
export function getBeatsPerMeasure(timeSignature: TimeSignature): number {
    const map: Record<TimeSignature, number> = {
        '4/4': 4,
        '3/4': 3,
        '6/8': 2, // 6/8박자는 점4분음표 2개로 카운트하는 것이 일반적이나, 여기서는 박자 수 자체보다는 마디 길이를 구하는 것이 목적이므로 
        // BPM이 4분음표 기준인지 점4분음표 기준인지에 따라 다름. 
        // 통상적으로 6/8은 8분음표 6개지만, BPM이 4분음표 기준이라면 환산이 필요함.
        // 단순화를 위해 4분음표 기준 BPM이라고 가정하고, 6/8은 1마디에 3박(점2분음표) 또는 2박(점4분음표)으로 해석될 수 있음.
        // 여기서는 사용자가 제공한 예시(BPM 90, 3/4박자 -> 2초)를 역산해보면: 60/90 = 0.666...초/박 * 3박 = 2초.
        // 즉, BPM은 분모에 해당하는 음표 기준임.
        // 6/8의 경우 분모가 8분음표이므로, BPM이 8분음표 기준이라면 6박.
        // 하지만 보통 BPM은 4분음표 기준(Quarter Note)으로 표기함.
        // 만약 BPM이 4분음표 기준이라면, 6/8박자(8분음표 6개 = 4분음표 3개)는 3박으로 계산해야 함.
        // 여기서는 4/4=4, 3/4=3, 2/4=2, 5/4=5 로 분자가 박자 수가 됨.
        // 6/8의 경우 8분음표가 6개이므로 4분음표로는 3개임. 따라서 3을 반환하는 것이 맞음.
        // 하지만 기존 코드 예시에는 6/8이 없었고, 3/4만 있었음.
        // 사용자의 요청에 6/8이 포함되어 있으므로, 6/8은 3박(4분음표 기준)으로 처리하거나, 
        // 6/8박자의 BPM이 점4분음표 기준인지 확인 필요.
        // 통상적인 DAW에서는 6/8일 때 BPM은 4분음표 기준이 아니라 점4분음표 기준일 수도 있고 8분음표 기준일 수도 있음.
        // 일단 안전하게 분자가 6인 경우 4분음표 3개로 환산하여 3을 리턴하거나, 
        // 혹은 6/8박자 곡의 BPM이 점4분음표 기준(dotted quarter)이라고 가정하면 2박이 됨.
        // 재즈 스탠다드에서는 6/8을 2박(점4분음표 2개)으로 세는 경우가 많음 (Compound Duple Meter).
        // 따라서 2를 반환하도록 함.
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
