import {
    getBeatsPerMeasure,
    calculateMeasureDuration,
    getCurrentMeasure,
    seekByMeasures,
    generateProgressSections
} from './musicCalculations';
import { StructureData } from '@/types/music';

describe('Music Calculations', () => {
    describe('getBeatsPerMeasure', () => {
        it('should return correct beats for standard time signatures', () => {
            expect(getBeatsPerMeasure('4/4')).toBe(4);
            expect(getBeatsPerMeasure('3/4')).toBe(3);
            expect(getBeatsPerMeasure('2/4')).toBe(2);
            expect(getBeatsPerMeasure('5/4')).toBe(5);
        });

        it('should return 2 for 6/8 time signature', () => {
            expect(getBeatsPerMeasure('6/8')).toBe(2);
        });
    });

    describe('calculateMeasureDuration', () => {
        it('should calculate correct duration for 120 BPM 4/4', () => {
            // 60/120 * 4 = 2.0
            expect(calculateMeasureDuration(120, '4/4')).toBe(2.0);
        });

        it('should calculate correct duration for 140 BPM 4/4', () => {
            // 60/140 * 4 = 1.71428...
            expect(calculateMeasureDuration(140, '4/4')).toBeCloseTo(1.714, 3);
        });

        it('should calculate correct duration for 90 BPM 3/4', () => {
            // 60/90 * 3 = 2.0
            expect(calculateMeasureDuration(90, '3/4')).toBe(2.0);
        });
    });

    describe('getCurrentMeasure', () => {
        const measureDuration = 2.0; // 120 BPM 4/4

        it('should return 1 for start of song', () => {
            expect(getCurrentMeasure(0, measureDuration)).toBe(1);
        });

        it('should return 1 for middle of first measure', () => {
            expect(getCurrentMeasure(1.5, measureDuration)).toBe(1);
        });

        it('should return 2 for start of second measure', () => {
            expect(getCurrentMeasure(2.0, measureDuration)).toBe(2);
        });

        it('should return 2 for slightly after start of second measure', () => {
            expect(getCurrentMeasure(2.1, measureDuration)).toBe(2);
        });
    });

    describe('seekByMeasures', () => {
        const measureDuration = 2.0;
        const totalDuration = 100.0;

        it('should seek forward 1 measure correctly', () => {
            // Current: 2.5s (Measure 2) -> Seek +1 -> Measure 3 Start (4.0s)
            expect(seekByMeasures(2.5, 1, measureDuration, totalDuration)).toBe(4.0);
        });

        it('should seek backward 1 measure correctly', () => {
            // Current: 4.5s (Measure 3) -> Seek -1 -> Measure 2 Start (2.0s)
            expect(seekByMeasures(4.5, -1, measureDuration, totalDuration)).toBe(2.0);
        });

        it('should clamp to 0 when seeking before start', () => {
            // Current: 1.0s (Measure 1) -> Seek -1 -> Measure 0 -> 0s
            expect(seekByMeasures(1.0, -1, measureDuration, totalDuration)).toBe(0);
        });

        it('should clamp to totalDuration when seeking past end', () => {
            // Current: 99s -> Seek +10 -> Past end -> 100s
            expect(seekByMeasures(99, 10, measureDuration, totalDuration)).toBe(100.0);
        });
    });

    describe('generateProgressSections', () => {
        const structureData: StructureData = {
            introMeasures: 4,
            outroMeasures: 4,
            sections: [
                { name: 'Intro', startMeasure: 1, endMeasure: 4, label: 'Intro' },
                { name: 'A', startMeasure: 5, endMeasure: 8, label: 'A Section' }
            ],
            totalMeasures: 8
        };
        const measureDuration = 2.0;

        it('should generate correct progress sections', () => {
            const sections = generateProgressSections(structureData, measureDuration);
            expect(sections).toHaveLength(2);

            expect(sections[0].value).toBe(0); // Measure 1 start
            expect(sections[0].label).toBe('Intro');

            expect(sections[1].value).toBe(8.0); // Measure 5 start: (5-1)*2 = 8
            expect(sections[1].label).toBe('A Section');
        });
    });
});
