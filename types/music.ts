/**
 * 음악적 시간 계산을 위한 타입 정의
 */

export type TimeSignature = '4/4' | '3/4' | '6/8' | '2/4' | '5/4';

export interface MusicSection {
    name: string;
    startMeasure: number;
    endMeasure: number;
    label: string;
}

// Feed용 오디오 URL 구조
export interface AudioUrls {
    intro: string;
    chorus: string;
    outro: string;
}

// Feed용 코드 데이터 (마디별 코드 배열)
export interface ChordData {
    intro: string[];    // ["Cm7", "F7", "Bb7", ...]
    chorus: string[];   // ["Cm7", "F7", "Bb7", ...]
    outro: string[];    // ["Cm7", "F7", "Bb7", ...]
}

export interface StructureData {
    introMeasures: number;
    outroMeasures: number;
    sections: MusicSection[];
    totalMeasures: number;
    // Feed용 추가 필드
    chorusMeasures?: number;      // chorus 1회 마디 수
    feedTotalMeasures?: number;   // Feed 총 마디 (intro + chorus×4 + outro)
    chorusPattern?: string;       // chorus 반복 패턴 (예: 'AABC')
}

export interface SongWithMusicData {
    id: string;
    title: string;
    artist: string;
    audio_url: string;
    image_url: string;
    duration: number;
    bpm: number;
    time_signature: TimeSignature;
    structure_data: StructureData;
    // Feed용 추가 필드
    audio_urls?: AudioUrls;
    chord_data?: ChordData;
}

export interface ProgressSection {
    value: number;
    label: string;
}

export interface MusicCalculationResult {
    measureDuration: number;
    beatsPerMeasure: number;
    currentMeasure: number;
    totalMeasures: number;
    progressSections: ProgressSection[];
}
