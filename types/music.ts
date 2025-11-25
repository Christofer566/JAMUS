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

export interface StructureData {
    introMeasures: number;
    outroMeasures: number;
    sections: MusicSection[];
    totalMeasures: number;
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
