# Pitch Accuracy Test History (1차 ~ 76차)

> 코드 주석 + 테스트 로그 기반 완전 기록

---

## 황금 설정 (절대 변경 금지)

| 파라미터 | 값 | 확정 차수 | 코드 위치 |
|----------|-----|-----------|-----------|
| **PULLBACK_BUFFER_MS** | 250ms | 75차 | `useRecorder.ts:531` |
| **TIMING_OFFSET_SLOTS** | 3 | 35차 | `pitchToNote.ts:82` |
| **TARGET_MIN_OCTAVE** | 3 | 37차 | `pitchToNote.ts:94` |
| **PHASE2_THRESHOLD** | 1.62 | 55차 | `pitchToNote.ts:268` |
| **RMS_THRESHOLD** | 0.018 | 40차 | `pitchToNote.ts:77` |
| **PITCH_CONFIDENCE_MIN** | 0.35 | 40차 | `pitchToNote.ts:79` |

---

## 역대 최고 기록

| 지표 | 최고값 | 달성 차수 | 핵심 전략 |
|------|--------|-----------|-----------|
| 타이밍 | **100%** | 47차 | 정답지 기반 동적 오프셋 |
| 타이밍 | **92.9%** | 75차 | PULLBACK 250ms + gap=0 병합 |
| 음정 | **80%** | 72차 | 저음 재검증 패스 (70-120Hz) |
| 길이 | **64.3%** | 75차 | Cross-Measure Merge |

---

## Phase별 코드 변경 상세 기록

### Phase 1-3: 기초 구조
| Phase | 변경 내용 | 코드 위치 |
|-------|----------|-----------|
| **1** | 타이밍 오프셋 적용 (TIMING_OFFSET_SLOTS) | `pitchToNote.ts:605` |
| **2** | 옥타브 자동 보정, 사람 목소리 범위(65-1047Hz) | `pitchToNote.ts:259, 418` |
| **3** | 옥타브 점프 후처리 → **DISABLED** (와이드 레인지 멜로디 지원) | `pitchToNote.ts:890` |

### Phase 15-37: TARGET_MIN_OCTAVE 탐색
| Phase | TARGET | 결과 | 비고 |
|-------|--------|------|------|
| **15** | 4→3 | 개선 | 남자 키 정답지 C3-C4 영역 맞춤 |
| **24** | 3→2 | **52.9%** 🥇 | 옥타브 강제 견인 성공 |
| **28** | 2→3 | 실패 | -12반음 오류 발생 |
| **29** | 3→2 | 복구 | 24차 성공 구조 복귀 |
| **30** | 2→3 | 복구 | TARGET=2 음정 0.0% 실패 |
| **32** | 3→2 | 유지 | 24차 황금 설정 복귀 |
| **37** | 2→3 | **확정** | threshold 1.55로 배음 필터 강화 |

### Phase 31-35: 타이밍 혁신
| Phase | 변경 내용 | 정확도 | 코드 위치 |
|-------|----------|--------|-----------|
| **31** | 하드웨어 지연 보정 도입 (목표 vs 실제 시간 차이) | 13.6% | `useRecorder.ts:465` |
| **32** | +1슬롯 탄착군 형성 | 12.5% | - |
| **35** | TIMING_OFFSET 2→3 | **66.7%** 🥇 | `pitchToNote.ts:82` |

### Phase 40-44: 감도 최적화
| Phase | 변경 내용 | 코드 위치 |
|-------|----------|-----------|
| **40** | RMS 0.02→0.018, CONFIDENCE 0.5→0.35 | `pitchToNote.ts:77,79` |
| **42** | 옥타브 5 이상 강제 하향 | `pitchToNote.ts:116` |
| **44** | **Pitch Snap** 도입 (±50 cents 반음 스냅) | `pitchToNote.ts:137` |

### Phase 48-55: 저음역대 공략
| Phase | 변경 내용 | 결과 | 코드 위치 |
|-------|----------|------|-----------|
| **48** | TARGET 3→2 (저음역대 시도) | **실패** - 1옥타브 낮게 | - |
| **49** | TARGET 2→3 롤백, 저음역대 ±75 cents 확장 | 52.4% | `pitchToNote.ts:156` |
| **52** | Warm-up, Multi-Window Analysis | 50% | `usePitchAnalyzer.ts:58` |
| **53** | 지연 측정, Segment Pull-back | 61.1% | `useRecorder.ts:619` |
| **55** | Pull-back 400ms, **threshold 1.62 확정** | **83.3%** | `useRecorder.ts:529` |

### Phase 62-67: 앙상블 실험
| Phase | 변경 내용 | 결과 | 코드 위치 |
|-------|----------|------|-----------|
| **62** | MPM + YIN + HPS 앙상블 | 복잡성 증가 | `usePitchAnalyzer.ts:409,488` |
| **63** | 앙상블 옥타브 보정, median 복구 | 55.6% | `usePitchAnalyzer.ts:626` |
| **66** | Mode 함수 비활성화, 옥타브 가드레일 200Hz | 65% | `pitchToNote.ts:108` |
| **67** | 로그 간소화 (성능 최적화) | - | 전체 |

### Phase 71-75: 최종 최적화 (현재 황금 설정)
| Phase | 변경 내용 | 정확도 | 코드 위치 |
|-------|----------|--------|-----------|
| **71** | 첫 음 강제 정렬 **비활성화** (의도적 공백 존중) | 84.6% | `pitchToNote.ts:779` |
| **72** | **저음 재검증 패스** (70-120Hz) | **80%** 🥇 | `pitchToNote.ts:467` |
| **73** | 에너지 피크 검출 (1슬롯 음표 허용) | 72.7% | `pitchToNote.ts:536` |
| **74-A** | Cross-Measure Merge (마디 경계 연결음) | - | `pitchToNote.ts:790` |
| **74-B** | Legato Smoothing (미세 쉼표 메우기) | - | `pitchToNote.ts:837` |
| **74-C** | Duration Normalization | - | `pitchToNote.ts:867` |
| **75** | gap=0 병합, Sustain Bridge, **PULLBACK 250ms** | **92.9%** 🥇 | `pitchToNote.ts:808` |

### Phase 76: 실패 (롤백 필요)
| 변경 | 결과 |
|------|------|
| PULLBACK 250→200ms | 타이밍 73.3%→6.7% **붕괴** |
| Energy Peak 0.75→0.60 | 음정 71.4%→6.7% **붕괴** |

---

## 실패한 시도들 (절대 반복 금지)

| 시도 | 결과 | 원인 | 차수 |
|------|------|------|------|
| TARGET_MIN_OCTAVE = 2 | 음정 0% | 전체가 한 옥타브 낮게 감지 | 29, 30, 48 |
| PULLBACK 200ms | 타이밍 붕괴 | 75차 황금값 이탈 | 76 |
| Phase 2 Threshold 1.5 | 음정 0% | 진짜 음정까지 배음으로 오인 | 57 |
| Phase 2 Threshold 1.55 | 음정 불안정 | 미세하게 예민함 | 50 |
| 옥타브 강제 /2 | 음정 왜곡 | 음악적 맥락 무시 | 65 |
| RMS 0.012 | 노이즈 폭증 | 숨소리까지 음표로 인식 | 46 |
| gap <= 1 병합 | 15슬롯 괴물 | 과잉 병합 | 74 |
| Mode 필터 (66차) | 불안정 | 옥타브 튐 | 66 |
| HPS 앙상블 (62차) | 멈춤 | FFT 연산 부하 | 62 |

---

## 핵심 교훈 요약

### 1. 박자(Timing)
- **OFFSET 3 + PULLBACK 250ms = 92.9%**
- 하드웨어 지연 보정(Phase 31)이 기반
- 첫 음 강제 정렬 비활성화(Phase 71)로 의도적 공백 존중

### 2. 음정(Pitch)
- **TARGET 3 + Threshold 1.62 = 80%**
- 저음 재검증 패스(Phase 72)로 D2~A#2 복구
- Pitch Snap(Phase 44)으로 반음 정밀도 확보
- 옥타브 가드레일 200Hz(Phase 53/66)로 배음 방어

### 3. 길이(Duration)
- **gap=0 병합 + MAX_MERGE_SLOTS 제한 = 64.3%**
- Sustain Bridge(Phase 75)로 Decay 구간 연장
- Legato Smoothing(Phase 74-B)으로 미세 끊김 보정

---

## 다음 목표: 80% 달성을 위한 과제

1. **놓친 음표 12개 해결**
   - LOW_FREQ_RECOVERY_MAX 120→150Hz 확장
   - 마디 14~16 저음역대(D2, E2, F#2) 복구

2. **1슬롯 음표 감지 개선**
   - ENERGY_PEAK 임계값 완화 (0.75→0.65)
   - MIN_NOTE_DURATION_SLOTS 조건부 1 허용

3. **과잉 병합 방지**
   - MAX_MERGE_SLOTS = 8 제한

---

## 파일 위치 참조

```
utils/pitchToNote.ts     # 핵심 변환 로직 (Phase 1-75)
hooks/useRecorder.ts     # 녹음/타이밍 (Phase 31, 52, 55, 75)
hooks/usePitchAnalyzer.ts # 피치 분석 (Phase 52, 55, 62, 63)
```


---

## 자동 최적화 세션 (2026-01-01 15:23:24)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 최고 기록
| 지표 | 값 | 반복 횟수 |
|------|-----|----------|
| 음정 | 6.3% | 0차 |
| 타이밍 | 81.3% | 0차 |
| 길이 | 25.0% | 0차 |
| **종합** | **37.5%** | 0차 |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 130,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.7,
  "OCCUPANCY_SUSTAIN": 0.5,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.75,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.9,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 16
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 음정 | 타이밍 | 길이 | 종합 | 개선 |
|------|------|------|--------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 6.3% | 81.3% | 25.0% | 37.5% | +0.0% |
| 1 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 5.9% | 70.6% | 23.5% | 33.3% | -4.2% |
| 2 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 5.9% | 70.6% | 23.5% | 33.3% | +0.0% |
| 3 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 0.0% | 64.7% | 23.5% | 29.4% | -3.9% |
| 4 | Sustain 확장: OCCUPANCY_SUSTAIN ... | 0.0% | 64.7% | 23.5% | 29.4% | +0.0% |
| 5 | 짧은 음표 허용: MIN_NOTE_DURATION_SL... | 0.0% | 66.7% | 22.2% | 29.6% | +0.2% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN ... | 0.0% | 66.7% | 22.2% | 29.6% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→... | 0.0% | 64.7% | 23.5% | 29.4% | -0.2% |
| 8 | 탐색: MAX_MERGE_SLOTS 16→8 | 0.0% | 66.7% | 22.2% | 29.6% | +0.2% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 150→... | 5.9% | 82.4% | 23.5% | 37.3% | +7.6% |
| 10 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 5.6% | 72.2% | 22.2% | 33.3% | -3.9% |

### 시도한 파라미터 변경
- 0차: 75차 황금 설정 (초기값)
- 1차: 저음 확장: LOW_FREQ_RECOVERY_MAX 120→130
- 2차: 저음 확장: LOW_FREQ_RECOVERY_MAX 130→140
- 3차: 저음 확장: LOW_FREQ_RECOVERY_MAX 140→150
- 4차: Sustain 확장: OCCUPANCY_SUSTAIN 0.5→0.55
- 5차: 짧은 음표 허용: MIN_NOTE_DURATION_SLOTS 2→1
- 6차: 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.9→0.95
- 7차: 탐색: MIN_NOTE_DURATION_SLOTS 1→2
- 8차: 탐색: MAX_MERGE_SLOTS 16→8
- 9차: 탐색: LOW_FREQ_RECOVERY_MAX 150→120
- 10차: 저음 확장: LOW_FREQ_RECOVERY_MAX 120→130


---

## 자동 최적화 세션 (2026-01-01 15:24:25)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 최고 기록
| 지표 | 값 | 반복 횟수 |
|------|-----|----------|
| 음정 | 6.3% | 0차 |
| 타이밍 | 81.3% | 0차 |
| 길이 | 25.0% | 0차 |
| **종합** | **37.5%** | 0차 |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 130,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.7,
  "OCCUPANCY_SUSTAIN": 0.5,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.75,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.9,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 16
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 음정 | 타이밍 | 길이 | 종합 | 개선 |
|------|------|------|--------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 6.3% | 81.3% | 25.0% | 37.5% | +0.0% |
| 1 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 5.9% | 70.6% | 23.5% | 33.3% | -4.2% |
| 2 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 5.9% | 70.6% | 23.5% | 33.3% | +0.0% |
| 3 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 0.0% | 64.7% | 23.5% | 29.4% | -3.9% |
| 4 | Sustain 확장: OCCUPANCY_SUSTAIN ... | 0.0% | 64.7% | 23.5% | 29.4% | +0.0% |
| 5 | 짧은 음표 허용: MIN_NOTE_DURATION_SL... | 0.0% | 66.7% | 22.2% | 29.6% | +0.2% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN ... | 0.0% | 66.7% | 22.2% | 29.6% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→... | 0.0% | 64.7% | 23.5% | 29.4% | -0.2% |
| 8 | 탐색: MAX_MERGE_SLOTS 16→8 | 0.0% | 66.7% | 22.2% | 29.6% | +0.2% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 150→... | 5.9% | 82.4% | 23.5% | 37.3% | +7.6% |
| 10 | 저음 확장: LOW_FREQ_RECOVERY_MAX 1... | 5.6% | 72.2% | 22.2% | 33.3% | -3.9% |

### 시도한 파라미터 변경
- 0차: 75차 황금 설정 (초기값)
- 1차: 저음 확장: LOW_FREQ_RECOVERY_MAX 120→130
- 2차: 저음 확장: LOW_FREQ_RECOVERY_MAX 130→140
- 3차: 저음 확장: LOW_FREQ_RECOVERY_MAX 140→150
- 4차: Sustain 확장: OCCUPANCY_SUSTAIN 0.5→0.55
- 5차: 짧은 음표 허용: MIN_NOTE_DURATION_SLOTS 2→1
- 6차: 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.9→0.95
- 7차: 탐색: MIN_NOTE_DURATION_SLOTS 1→2
- 8차: 탐색: MAX_MERGE_SLOTS 16→8
- 9차: 탐색: LOW_FREQ_RECOVERY_MAX 150→120
- 10차: 저음 확장: LOW_FREQ_RECOVERY_MAX 120→130


---

## 배치 자동 최적화 세션 (2026-01-01 17:12:25)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 2개
- case_01: 26개 음표
- case_02: 28개 음표

### 최고 기록 (9차)
| 지표 | 값 |
|------|-----|
| 음정 | 8.6% |
| 타이밍 | 80.0% |
| 길이 | 37.1% |
| **종합** | **41.9%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 130,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8
}
```

### 반복 기록 (총 20회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.75... | 37.4% | +0.1% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.9→0... | 37.4% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 38.1% | +0.7% |
| 8 | 탐색: MAX_MERGE_SLOTS 16→8 | 38.1% | +0.0% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 150→120 | 41.9% | +3.8% |
| 10 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 37.0% | -4.9% |
| 11 | 음정 개선: LOW_FREQ_RECOVERY_MAX 130→14... | 38.0% | +0.9% |
| 12 | 탐색: OCCUPANCY_MIN 0.7→0.75 | 38.1% | +0.1% |
| 13 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 38.1% | +0.0% |
| 14 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 38.1% | +0.0% |
| 15 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 38.1% | +0.0% |
| 16 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 37.3% | -0.8% |
| 17 | 탐색: MAX_MERGE_SLOTS 8→12 | 37.3% | +0.0% |
| 18 | 탐색: LOW_FREQ_RECOVERY_MAX 150→120 | 41.2% | +3.9% |
| 19 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 36.2% | -5.0% |


---

## 배치 자동 최적화 세션 (2026-01-01 18:17:11)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 2개
- case_02: 28개 음표
- case_03: 28개 음표

### 최고 기록 (9차)
| 지표 | 값 |
|------|-----|
| 음정 | 14.3% |
| 타이밍 | 82.9% |
| 길이 | 48.6% |
| **종합** | **48.6%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8
}
```

### 반복 기록 (총 20회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.75... | 43.1% | +0.3% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.9→0... | 43.1% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 43.8% | +0.7% |
| 8 | 탐색: MAX_MERGE_SLOTS 16→8 | 43.8% | +0.0% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 150→120 | 48.6% | +4.8% |
| 10 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 45.1% | -3.5% |
| 11 | 음정 개선: LOW_FREQ_RECOVERY_MAX 130→14... | 43.8% | -1.3% |
| 12 | 탐색: OCCUPANCY_MIN 0.7→0.75 | 43.8% | +0.0% |
| 13 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 43.8% | +0.0% |
| 14 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 43.8% | +0.0% |
| 15 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 43.8% | +0.0% |
| 16 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 42.9% | -1.0% |
| 17 | 탐색: MAX_MERGE_SLOTS 8→12 | 42.9% | +0.0% |
| 18 | 탐색: LOW_FREQ_RECOVERY_MAX 150→120 | 47.6% | +4.8% |
| 19 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 44.1% | -3.5% |


---

## 배치 자동 최적화 세션 (2026-01-01 18:20:04)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 2개
- case_02: 28개 음표
- case_03: 28개 음표

### 최고 기록 (9차)
| 지표 | 값 |
|------|-----|
| 음정 | 28.6% |
| 타이밍 | 82.9% |
| 길이 | 48.6% |
| **종합** | **53.3%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8
}
```

### 반복 기록 (총 20회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.75... | 47.1% | +0.4% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.9→0... | 47.1% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 47.6% | +0.6% |
| 8 | 탐색: MAX_MERGE_SLOTS 16→8 | 47.6% | +0.0% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 150→120 | 53.3% | +5.7% |
| 10 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 49.0% | -4.3% |
| 11 | 음정 개선: LOW_FREQ_RECOVERY_MAX 130→14... | 47.6% | -1.4% |
| 12 | 탐색: OCCUPANCY_MIN 0.7→0.75 | 47.6% | +0.0% |
| 13 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 47.6% | +0.0% |
| 14 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 47.6% | +0.0% |
| 15 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 47.6% | +0.0% |
| 16 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 46.7% | -1.0% |
| 17 | 탐색: MAX_MERGE_SLOTS 8→12 | 46.7% | +0.0% |
| 18 | 탐색: LOW_FREQ_RECOVERY_MAX 150→120 | 52.4% | +5.7% |
| 19 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 48.0% | -4.3% |


---

## 배치 자동 최적화 세션 (2026-01-01 19:03:42)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 2개
- case_02: 28개 음표
- case_03: 28개 음표

### 최고 기록 (7차)
| 지표 | 값 |
|------|-----|
| 음정 | 60.0% |
| 타이밍 | 82.9% |
| 길이 | 48.6% |
| **종합** | **63.8%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8
}
```

### 반복 기록 (총 18회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 3 | 탐색: OCCUPANCY_MIN 0.7→0.75 | 61.9% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.5→0.55 | 61.9% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.75... | 62.7% | +0.8% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.9→0... | 62.7% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 63.8% | +1.1% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 63.8% | +0.0% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 59.8% | -4.0% |
| 10 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 51.9% | -8.0% |
| 11 | 음정 개선: LOW_FREQ_RECOVERY_MAX 130→14... | 49.5% | -2.3% |
| 12 | 음정 개선: LOW_FREQ_RECOVERY_MAX 140→15... | 51.9% | +2.3% |
| 13 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 51.9% | +0.0% |
| 14 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 51.9% | +0.0% |
| 15 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 51.9% | +0.0% |
| 16 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 48.1% | -3.7% |
| 17 | 탐색: MAX_MERGE_SLOTS 8→12 | 48.1% | +0.0% |


---

## 배치 자동 최적화 세션 (2026-01-01 19:36:47)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 3개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 63.8% |
| 타이밍 | 76.6% |
| 길이 | 44.7% |
| **종합** | **61.7%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 61.7% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 53.1% | -8.6% |
| 2 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 48.6% | -4.5% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 48.6% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 48.6% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 48.6% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 48.6% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 45.8% | -2.8% |
| 8 | 음정 개선: LOW_FREQ_RECOVERY_MAX 130→14... | 44.2% | -1.6% |
| 9 | 음정 개선: LOW_FREQ_RECOVERY_MAX 140→15... | 45.1% | +0.9% |
| 10 | 탐색: LOW_SOLO_THRESHOLD 120→130 | 45.8% | +0.7% |


---

## 배치 자동 최적화 세션 (2026-01-01 20:27:37)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 3개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 63.8% |
| 타이밍 | 76.6% |
| 길이 | 44.7% |
| **종합** | **61.7%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 61.7% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 53.1% | -8.6% |
| 2 | 음정 개선: LOW_FREQ_RECOVERY_MAX 120→13... | 48.6% | -4.5% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 48.6% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 48.6% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 48.6% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 48.6% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 45.8% | -2.8% |
| 8 | 음정 개선: LOW_FREQ_RECOVERY_MAX 130→14... | 44.2% | -1.6% |
| 9 | 음정 개선: LOW_FREQ_RECOVERY_MAX 140→15... | 45.1% | +0.9% |
| 10 | 탐색: LOW_SOLO_THRESHOLD 120→130 | 45.8% | +0.7% |


---

## 배치 자동 최적화 세션 (2026-01-03 09:48:03)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (3차)
| 지표 | 값 |
|------|-----|
| 음정 | 61.6% |
| 타이밍 | 64.4% |
| 길이 | 43.8% |
| **종합** | **56.6%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.65,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1
}
```

### 반복 기록 (총 14회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 56.2% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 48.9% | -7.3% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 56.2% | +7.3% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 56.6% | +0.5% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 56.6% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 56.6% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 56.6% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 55.7% | -0.9% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 56.6% | +0.9% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 52.3% | -4.3% |
| 10 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 49.3% | -3.0% |
| 11 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 56.6% | +7.3% |
| 12 | 탐색: OCCUPANCY_MIN 0.65→0.7 | 56.2% | -0.5% |
| 13 | 랜덤: ENERGY_PEAK_CONFIDENCE_MIN→0.7 | 56.6% | +0.5% |


---

## 배치 자동 최적화 세션 (2026-01-03 10:01:03)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 7개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표
- case_08: 16개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 56.3% |
| 타이밍 | 62.5% |
| 길이 | 40.0% |
| **종합** | **52.9%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.65,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1
}
```

### 반복 기록 (총 12회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 52.9% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 46.3% | -6.6% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 52.9% | +6.6% |
| 3 | 탐색: OCCUPANCY_MIN 0.65→0.7 | 52.5% | -0.4% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 52.9% | +0.4% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 52.9% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 52.9% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 52.2% | -0.7% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 52.9% | +0.7% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 48.9% | -4.0% |
| 10 | 랜덤: LOW_FREQ_CONFIDENCE_MIN→0.1 | 46.3% | -2.6% |
| 11 | 랜덤: OCCUPANCY_MIN→0.75 | 52.5% | +6.2% |


---

## 배치 자동 최적화 세션 (2026-01-03 10:03:03)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 61.6% |
| 타이밍 | 64.4% |
| 길이 | 43.8% |
| **종합** | **56.6%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.65,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 56.6% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 49.3% | -7.3% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 56.6% | +7.3% |
| 3 | 탐색: OCCUPANCY_MIN 0.65→0.7 | 56.2% | -0.5% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 56.6% | +0.5% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 56.6% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 56.6% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 55.7% | -0.9% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 56.6% | +0.9% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 52.3% | -4.3% |
| 10 | 랜덤: LOW_SOLO_THRESHOLD→130 | 52.0% | -0.3% |


---

## 배치 자동 최적화 세션 (2026-01-03 11:13:44)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 62.3% |
| 타이밍 | 62.3% |
| 길이 | 45.5% |
| **종합** | **56.7%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.65,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 56.7% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 50.4% | -6.3% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 56.7% | +6.3% |
| 3 | 탐색: OCCUPANCY_MIN 0.65→0.7 | 56.3% | -0.4% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 56.7% | +0.4% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 56.7% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 56.7% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 56.2% | -0.5% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 56.7% | +0.5% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 52.6% | -4.1% |
| 10 | 랜덤: OCCUPANCY_SUSTAIN→0.45 | 56.3% | +3.6% |


---

## 배치 자동 최적화 세션 (2026-01-03 13:24:08)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (3차)
| 지표 | 값 |
|------|-----|
| 음정 | 62.3% |
| 타이밍 | 62.3% |
| 길이 | 45.5% |
| **종합** | **56.7%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.65,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 14회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 56.3% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 50.0% | -6.3% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 56.3% | +6.3% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 56.7% | +0.4% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.45 | 56.7% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 56.7% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 56.7% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 56.2% | -0.5% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 56.7% | +0.5% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 52.6% | -4.1% |
| 10 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 50.4% | -2.2% |
| 11 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 56.7% | +6.3% |
| 12 | 탐색: OCCUPANCY_MIN 0.65→0.7 | 56.3% | -0.4% |
| 13 | 랜덤: MIN_NOTE_DURATION_SLOTS→2 | 56.2% | -0.1% |


---

## 배치 자동 최적화 세션 (2026-01-03 13:28:57)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 65.4% |
| 타이밍 | 72.8% |
| 길이 | 37.0% |
| **종합** | **58.4%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 58.4% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→160 | 58.4% | +0.0% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 58.4% | +0.0% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.55 | 57.3% | -1.1% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.55→0.4 | 58.4% | +1.1% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 58.4% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 58.4% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 1→2 | 56.9% | -1.5% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 58.4% | +1.5% |
| 9 | 탐색: TIMING_OFFSET_SLOTS 3→4 | 58.4% | +0.0% |
| 10 | 탐색: LOW_FREQ_RECOVERY_MAX 120→150 | 58.2% | -0.2% |


---

## 배치 자동 최적화 세션 (2026-01-03 13:30:51)

### 종료 사유: 목표 달성 (87.2% >= 80%)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 75.3% |
| 타이밍 | 100.0% |
| 길이 | 86.4% |
| **종합** | **87.2%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.55,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 1,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 1회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 87.2% | +0.0% |


---

## 배치 자동 최적화 세션 (2026-01-03 15:15:11)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (14차)
| 지표 | 값 |
|------|-----|
| 음정 | 83.3% |
| 타이밍 | 67.9% |
| 길이 | 42.9% |
| **종합** | **64.7%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.45,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.7,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 25회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 10 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 55.0% | -6.0% |
| 11 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 64.3% | +9.2% |
| 12 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 64.3% | +0.0% |
| 13 | 탐색: OCCUPANCY_SUSTAIN 0.45→0.5 | 64.3% | +0.0% |
| 14 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 64.7% | +0.4% |
| 15 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 64.7% | +0.0% |
| 16 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 63.7% | -1.0% |
| 17 | 탐색: MAX_MERGE_SLOTS 8→12 | 63.7% | +0.0% |
| 18 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 61.4% | -2.2% |
| 19 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 58.4% | -3.0% |
| 20 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 64.7% | +6.3% |
| 21 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 64.7% | +0.0% |
| 22 | 탐색: OCCUPANCY_SUSTAIN 0.45→0.5 | 64.7% | +0.0% |
| 23 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.7→... | 64.7% | +0.0% |
| 24 | 랜덤: MAX_MERGE_SLOTS→12 | 63.7% | -1.0% |


---

## 배치 자동 최적화 세션 (2026-01-03 15:17:37)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 84.5% |
| 타이밍 | 77.4% |
| 길이 | 42.9% |
| **종합** | **68.3%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.45,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.7,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 68.3% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 62.0% | -6.3% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 68.3% | +6.3% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 68.3% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.45→0.5 | 68.3% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.7→... | 68.3% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 68.3% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 67.4% | -0.8% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 68.3% | +0.8% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 66.7% | -1.6% |
| 10 | 랜덤: LOW_SOLO_THRESHOLD→140 | 68.3% | +1.6% |


---

## 배치 자동 최적화 세션 (2026-01-03 15:20:52)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 84.5% |
| 타이밍 | 77.4% |
| 길이 | 42.9% |
| **종합** | **68.3%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.45,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.7,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 68.3% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 62.0% | -6.3% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 68.3% | +6.3% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 68.3% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.45→0.5 | 68.3% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.7→... | 68.3% | +0.0% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 68.3% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 67.4% | -0.8% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 68.3% | +0.8% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 66.7% | -1.6% |
| 10 | 랜덤: LOW_SOLO_THRESHOLD→130 | 64.3% | -2.4% |


---

## 배치 자동 최적화 세션 (2026-01-03 15:36:46)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (11차)
| 지표 | 값 |
|------|-----|
| 음정 | 84.3% |
| 타이밍 | 77.1% |
| 길이 | 51.8% |
| **종합** | **71.1%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.45,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 22회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 70.0% | -1.0% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 71.0% | +1.0% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 69.1% | -2.0% |
| 10 | 랜덤: LOW_FREQ_CONFIDENCE_MIN→0.1 | 64.7% | -4.4% |
| 11 | 랜덤: ENERGY_PEAK_CONFIDENCE_MIN→0.8 | 71.1% | +6.4% |
| 12 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 71.1% | +0.0% |
| 13 | 탐색: OCCUPANCY_SUSTAIN 0.45→0.5 | 71.1% | +0.0% |
| 14 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 71.0% | -0.1% |
| 15 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 71.1% | +0.1% |
| 16 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 70.0% | -1.0% |
| 17 | 탐색: MAX_MERGE_SLOTS 8→12 | 71.1% | +1.0% |
| 18 | 탐색: LOW_FREQ_RECOVERY_MAX 120→130 | 69.1% | -2.0% |
| 19 | 탐색: LOW_SOLO_THRESHOLD 150→120 | 64.7% | -4.4% |
| 20 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 71.1% | +6.4% |
| 21 | 랜덤: OCCUPANCY_SUSTAIN→0.5 | 71.1% | +0.0% |


---

## 배치 자동 최적화 세션 (2026-01-03 15:39:41)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 84.3% |
| 타이밍 | 77.1% |
| 길이 | 51.8% |
| **종합** | **71.1%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.45,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 71.1% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→170 | 71.1% | +0.0% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 71.1% | +0.0% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 71.1% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.45→0.5 | 71.1% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 71.0% | -0.1% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 71.1% | +0.1% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 70.0% | -1.0% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 71.1% | +1.0% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→140 | 69.1% | -2.0% |
| 10 | 랜덤: LOW_SOLO_THRESHOLD→200 | 71.1% | +2.0% |


---

## 배치 자동 최적화 세션 (2026-01-03 15:54:56)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 86.9% |
| 타이밍 | 77.4% |
| 길이 | 50.0% |
| **종합** | **71.4%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.2,
  "OCCUPANCY_MIN": 0.75,
  "OCCUPANCY_HIGH": 0.7,
  "OCCUPANCY_SUSTAIN": 0.45,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.8,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.95,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.35,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 71.4% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→170 | 71.4% | +0.0% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.2→0.1 | 71.4% | +0.0% |
| 3 | 탐색: OCCUPANCY_MIN 0.75→0.65 | 71.4% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.45→0.5 | 71.4% | +0.0% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.8→... | 71.4% | -0.1% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.95→... | 71.4% | +0.1% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 70.4% | -1.1% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 71.4% | +1.1% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→140 | 69.5% | -2.0% |
| 10 | 랜덤: LOW_SOLO_THRESHOLD→200 | 71.4% | +2.0% |


---

## 배치 자동 최적화 세션 (2026-01-03 16:10:36)

### 종료 사유: 정체 종료 (10회 연속 개선 없음)

### 테스트 케이스: 6개
- case_02: 28개 음표
- case_03: 28개 음표
- case_04: 27개 음표
- case_05: 16개 음표
- case_06: 16개 음표
- case_07: 32개 음표

### 최고 기록 (0차)
| 지표 | 값 |
|------|-----|
| 음정 | 86.7% |
| 타이밍 | 77.1% |
| 길이 | 50.6% |
| **종합** | **71.5%** |

### 최적 파라미터
```json
{
  "LOW_FREQ_RECOVERY_MAX": 120,
  "LOW_SOLO_THRESHOLD": 150,
  "LOW_FREQ_CONFIDENCE_MIN": 0.15,
  "OCCUPANCY_MIN": 0.7,
  "OCCUPANCY_HIGH": 0.65,
  "OCCUPANCY_SUSTAIN": 0.4,
  "ENERGY_PEAK_CONFIDENCE_MIN": 0.75,
  "ENERGY_PEAK_OCCUPANCY_MIN": 0.9,
  "MIN_NOTE_DURATION_SLOTS": 2,
  "MAX_MERGE_SLOTS": 8,
  "PITCH_CONFIDENCE_MIN": 0.3,
  "GRID_SNAP_TOLERANCE": 0.15,
  "TIMING_OFFSET_SLOTS": 3,
  "MID_FREQ_MIN": 200,
  "HIGH_FREQ_MIN": 500,
  "LOW_FREQ_OCCUPANCY_BONUS": 0.1,
  "ONSET_ENERGY_RATIO": 2,
  "ONSET_CONFIDENCE_JUMP": 0.3,
  "ONSET_DETECTION_ENABLED": false,
  "PITCH_STABILITY_THRESHOLD": 0.2,
  "PITCH_STABILITY_ENABLED": false
}
```

### 반복 기록 (총 11회)
| 차수 | 전략 | 종합 | 개선 |
|------|------|------|------|
| 0 | 75차 황금 설정 (초기값) | 71.5% | +0.0% |
| 1 | 탐색: LOW_SOLO_THRESHOLD 150→170 | 71.5% | +0.0% |
| 2 | 탐색: LOW_FREQ_CONFIDENCE_MIN 0.15→0.... | 71.5% | +0.0% |
| 3 | 탐색: OCCUPANCY_MIN 0.7→0.75 | 71.5% | +0.0% |
| 4 | 탐색: OCCUPANCY_SUSTAIN 0.4→0.45 | 71.4% | -0.1% |
| 5 | 탐색: ENERGY_PEAK_CONFIDENCE_MIN 0.75... | 71.5% | +0.1% |
| 6 | 탐색: ENERGY_PEAK_OCCUPANCY_MIN 0.9→0... | 71.5% | +0.0% |
| 7 | 탐색: MIN_NOTE_DURATION_SLOTS 2→1 | 70.5% | -1.0% |
| 8 | 탐색: MAX_MERGE_SLOTS 8→12 | 71.5% | +1.0% |
| 9 | 탐색: LOW_FREQ_RECOVERY_MAX 120→140 | 69.9% | -1.6% |
| 10 | 랜덤: LOW_FREQ_CONFIDENCE_MIN→0.1 | 71.5% | +1.6% |


---

## Phase 99/101 Duration 개선 세션 (2026-01-04)

### 평가 기준 변경
**±1 tolerance 통합 기준** (음정, 타이밍, 길이 모두 ±1슬롯)
- 이전 기준: 관대한 tolerance (TIMING_TOLERANCE=16, DURATION_TOLERANCE=4)
- 새 기준: 엄격한 ±1 tolerance (라이브앱과 동일)

### 문제 분석
- Duration 정확도가 가장 낮음 (54.8%)
- 원인: Onset Detection이 긴 음표를 1슬롯 단위로 분리
- GT 4슬롯 음표 → 1슬롯으로 감지 (평균 -1.55슬롯 짧게)

### 알고리즘 개선

**Phase 99: Short Note Consolidation**
- 연속된 짧은 음표(1-2슬롯)를 유사 음정이면 병합
- 조건: 인접(gap≤1) + 유사 음정(±1반음)

**Phase 101: Duration Extension Bias**
- 1슬롯 음표를 4슬롯으로 확장 편향
- Duration Quantization에서 1슬롯→4슬롯 자동 확장

### 결과 비교
| 지표 | 이전 (±1 기준) | 이후 (Phase 99/101) | 변화 |
|------|----------------|---------------------|------|
| 회수율 | 89.1% | 88.5% | -0.6% |
| 음정 | 71.6% | 71.4% | -0.2% |
| 타이밍 | 80.0% | 79.2% | -0.8% |
| **길이** | **54.8%** | **63.6%** | **+8.8%** |
| **종합** | **68.8%** | **71.4%** | **+2.6%** |

### 케이스별 결과
| Case | Pitch | Timing | Duration | Overall |
|------|-------|--------|----------|---------|
| case_02 | 88.5% | 84.6% | 80.8% | 84.6% |
| case_03 | 84.0% | 96.0% | 64.0% | 81.3% |
| case_04 | 60.9% | 69.6% | 87.0% | 72.5% |
| case_05 | 62.5% | 100.0% | 68.8% | 77.1% |
| case_06 | 92.9% | 64.3% | 35.7% | 64.3% |
| case_07 | 57.1% | 64.3% | 32.1% | 51.2% |
| case_08 | 59.1% | 77.3% | 72.7% | 69.7% |

### 최적 파라미터 (4차 황금 설정)
goldenSettings75.json과 동일 (변경 없음, 알고리즘 개선으로 정확도 향상)

### 남은 과제
- 목표 80%까지 8.6% 필요
- case_06, case_07 Duration 저하 (실제 1슬롯 음표가 4슬롯으로 확장)

---

## Phase 112-114: Octave Correction & Context Filter 세션 (2026-01-04)

### 문제 분석
- 옥타브 오류가 전체 오류의 15.5% 차지 (20개 중 16 UP, 4 DOWN)
- D2-A2 (65-110Hz)가 D3-A3 (130-220Hz)로 잘못 감지됨
- 기존 전역 context 방식으로는 연속된 잘못된 감지 수정 불가

### Phase 112: Anchor Point Method
**알고리즘**:
1. 녹음 전체에서 65-100Hz 저음 프레임을 앵커 포인트로 수집
2. 130-220Hz 주파수가 앵커의 2배(±1반음)일 때 옥타브 내림

**결과**:
| 지표 | 이전 | 이후 | 변화 |
|------|------|------|------|
| 음정 | 70.9% | 75.4% | +4.5% |
| 타이밍 | 77.7% | 81.0% | +3.3% |
| 길이 | 54.2% | 57.0% | +2.8% |
| **종합** | **67.6%** | **71.1%** | **+3.5%** |

### Phase 113: Scale Mapping (Conservative Mode)
**알고리즘**:
- Key 정보(예: "Gm")를 사용하여 스케일 외 음 감지
- 공격적 스냅 → 정확도 하락 (75.4% → 70.4%) ❌
- 보수적 모드 채택: 짧은 음표(1-2슬롯) + 스케일 밖 → confidence만 하향

**참고**: Jazz 곡의 블루노트, 경과음을 보호하기 위해 스냅 대신 마킹만 수행

### Phase 114: Wide Context + Octave Correction (Enhanced)
**알고리즘**:
1. ±2마디 범위에서 context 평균 MIDI 계산
2. 8반음 이상 차이나는 짧은 음표(1-2슬롯) 감지
3. 옥타브 보정 시도 (스케일 정보 활용)
4. 보정 성공 시 pitch 변경, 실패 시 confidence 하향

**결과**:
| 지표 | Phase 112만 | Phase 113+114 | 변화 |
|------|-------------|---------------|------|
| 음정 | 75.4% | 80.4% | +5.0% |
| 타이밍 | 81.0% | 81.0% | - |
| 길이 | 57.0% | 57.0% | - |
| **종합** | **71.1%** | **72.8%** | **+1.7%** |

### 케이스별 결과
| Case | Pitch | Timing | Duration | Overall |
|------|-------|--------|----------|---------|
| case_02 | 88.5% | 84.6% | 53.8% | 75.6% |
| case_03 | 84.0% | 96.0% | 64.0% | 81.3% |
| case_04 | 73.9% | 73.9% | 56.5% | 68.1% |
| case_05 | 62.5% | 100.0% | 31.3% | 64.6% |
| case_06 | 92.9% | 64.3% | 64.3% | 73.8% |
| case_07 | 89.7% | 69.0% | 89.7% | **82.8%** ⬆️ |
| case_08 | 63.6% | 72.7% | 22.7% | 53.0% |
| case_09 | 83.3% | 87.5% | 58.3% | 76.4% |

### 핵심 성과
- **case_07**: 72.4% → 82.8% (+10.4%) - 옥타브 DOWN 오류 수정
- **Phase 114**: 13개 음표 옥타브 보정 성공

### 코드 변경
- `utils/pitchToNote.ts`: Phase 112, 113, 114 추가
- `data/songs.ts`: SongMeta에 key 필드 추가
- `tests/pitch-accuracy/batchRunner.ts`: key 파라미터 전달

### 목표까지
- 현재: 72.8%
- 목표: 80%
- 남은 격차: 7.2%

---

## Phase 115-117: Duration 개선 시도 (2026-01-04)

### 문제 분석
- Duration 정확도 57%가 전체 성능의 병목
- **Fragmentation 문제**: 4슬롯 음표가 1슬롯으로 쪼개지는 현상 확인
- Gemini 제안 검토: Energy-Based Bridging, Rhythmic Quantization, Min-Duration Threshold, Envelope Analysis

### Phase 115: Fragment Recovery (Min-Duration Threshold)
**아이디어**: 2슬롯 이하 짧은 fragment를 동일 피치 인접 음표에 흡수

**결과**: ❌ 실패
- 유효한 짧은 음표(16분음표 등)까지 제거됨
- Duration: 57.0% → 54.5% (-2.5%)
- Overall: 72.8% → 69.1% (-3.7%)

### Phase 116: Enhanced Duration Quantization
**아이디어**: 1슬롯→2슬롯, 3슬롯→4슬롯 강제 스냅

**결과**: ❌ 실패
- GT와 불일치 증가 (실제 1슬롯 음표가 4슬롯으로 확장됨)
- Phase 115와 함께 적용 시 전체 정확도 하락

### Phase 117: MAX_MERGE_SLOTS 테스트
**아이디어**: 병합 제한을 6→12→16으로 늘려 긴 음표 검출 개선

**테스트 결과**:
| MAX_MERGE_SLOTS | Pitch | Timing | Duration | Overall |
|-----------------|-------|--------|----------|---------|
| **6 (기존)** | **80.4%** | **81.0%** | **57.0%** | **72.8%** |
| 12 | 77.8% | 80.1% | 56.3% | 71.4% |
| 16 | 77.1% | 79.4% | 55.8% | 70.8% |

**결과**: ❌ 실패
- 과잉 병합으로 개별 음표가 하나로 합쳐짐
- case_07: 82.8% → 71.6% (-11.2%) 급락

### 결론
- **현재 설정(MAX_MERGE_SLOTS=6)이 최적**
- Phase 115/116: 비활성화 (코드 주석 처리)
- Duration 57%는 현재 알고리즘의 한계
- 새로운 접근 필요: Envelope Analysis 또는 고정밀 onset detection

### 교훈
1. Fragment 흡수 전략은 Jazz 곡의 짧은 음표(grace note, 16분음표)에 역효과
2. 강제 Quantization은 GT와 불일치 유발
3. 병합 범위 확장은 과잉 병합 위험

### 현재 상태 유지
| 지표 | 값 |
|------|-----|
| 음정 | 80.4% |
| 타이밍 | 81.0% |
| 길이 | 57.0% |
| **종합** | **72.8%** |

### 향후 방향
- Duration 개선을 위해서는 onset detection 고도화 필요
- Energy envelope 분석 또는 ML 기반 접근 검토
- 현재는 Pitch/Timing 우선 최적화 유지

---

## Phase 118-120: Duration 개선 시도 2차 (2026-01-04)

### 배경
- Phase 115-117 실패 후 새로운 접근 시도
- Gemini 제안: Spectral Flux, Note-Off Detection, Adaptive Threshold, ML 기반
- Claude 추가 제안: Pitch Continuity, Energy Contour, Onset 임계값 조정

### Phase 120: Onset 임계값 조정
**아이디어**: Onset 감지를 덜 민감하게 설정하여 과도한 분리 방지

**테스트 결과**:
| 설정 | Pitch | Timing | Duration | Overall |
|------|-------|--------|----------|---------|
| 기존 (1.05, 0.03) | 80.4% | 81.0% | 57.0% | **72.8%** |
| 완화 (1.08, 0.05) | 77.1% | 77.1% | 56.0% | 70.1% |
| 강화 완화 (1.15, 0.10) | 72.5% | 73.7% | 53.2% | 66.5% |

**결과**: ❌ 실패
- Onset 감도를 낮추면 전체 정확도가 급락
- 현재 민감도(1.05, 0.03)가 최적

### Phase 118: Pitch Continuity Merge (Fragment Recovery v2)
**아이디어**: 같은 피치의 연속 짧은 음표를 병합 (Phase 115 개선)
- **핵심 차이**: 양쪽 다 2슬롯 이하일 때만 병합 (긴 음표 보호)

**알고리즘**:
```
if (currNote.slotCount <= 2 && prevNote.slotCount <= 2 
    && currNote.pitch === prevNote.pitch 
    && gap <= 1) {
  merge(prevNote, currNote);
}
```

**결과**: ✅ 성공
| 지표 | 이전 | 이후 | 변화 |
|------|------|------|------|
| 음정 | 80.4% | 80.3% | -0.1% |
| 타이밍 | 81.0% | 80.9% | -0.1% |
| **길이** | **57.0%** | **58.4%** | **+1.4%** |
| **종합** | **72.8%** | **73.2%** | **+0.4%** |

### Phase 119: Multi-Pass Merge & Threshold 테스트
**시도 1**: Fragment Threshold 확장 (2→3슬롯)
- 결과: ❌ 역효과 (73.2% → 72.5%)

**시도 2**: 다중 패스 병합 (최대 3회 반복)
- 결과: 변화 없음 (이미 단일 패스로 충분)

### 최종 결과
| 지표 | Phase 117 이후 | Phase 118-120 이후 | 변화 |
|------|----------------|-------------------|------|
| 음정 | 80.4% | 80.3% | -0.1% |
| 타이밍 | 81.0% | 80.9% | -0.1% |
| 길이 | 57.0% | 58.4% | +1.4% |
| **종합** | **72.8%** | **73.2%** | **+0.4%** |

### 케이스별 변화
| Case | 이전 Duration | 이후 Duration | 변화 |
|------|---------------|---------------|------|
| case_09 | 58.3% | 65.2% | +6.9% ⬆️ |
| case_07 | 89.7% | 89.7% | - |
| case_05 | 31.3% | 31.3% | - |
| case_08 | 22.7% | 22.7% | - |

### 코드 변경
- `utils/pitchToNote.ts`: Phase 118/119 Pitch Continuity Merge 추가
- 조건: 양쪽 모두 ≤2슬롯, 같은 피치, gap ≤1
- 다중 패스 (MAX_PASSES=3) 적용

### 교훈
1. **Onset 감도는 현재가 최적** - 완화하면 전체 정확도 급락
2. **짧은 음표끼리만 병합**이 핵심 - 긴 음표에 흡수 시 역효과
3. **점진적 개선** - Duration 57% → 58.4%로 소폭 개선

### 남은 과제
- Duration 58.4%는 여전히 병목
- case_05 (31.3%), case_08 (22.7%)는 구조적 문제 가능성
- 목표 80%까지 6.8% 필요

---

## Phase 121: Onset Detection with Pitch Change Condition (2026-01-05)

### 배경
- case_05/case_08 상세 분석 결과:
  - **case_05**: GT 16개 → 검출 33개 (2배 과검출)
  - 16슬롯 음표가 1-2슬롯으로 조각화
  - **case_08**: 4슬롯 음표가 1슬롯으로 검출 (-3슬롯 차이 10회)
- **근본 원인**: Onset Detection이 지속음 내에서 false positive 발생

### Phase 121 v1: 항상 Pitch 변화 요구
**아이디어**: Onset을 인정하려면 pitch가 변해야 함
```typescript
if ((energyRatio >= 1.05 || confJump >= 0.03) && pitchChanged) → onset
```

**결과**: ❌ 대실패
| 지표 | 이전 | 이후 | 변화 |
|------|------|------|------|
| 음정 | 80.3% | 73.1% | -7.2% |
| 타이밍 | 80.9% | 75.4% | -5.5% |
| 길이 | 58.4% | 54.4% | -4.0% |
| **종합** | **73.2%** | **67.6%** | **-5.6%** |

**원인**: 같은 pitch 반복음 (C3 C3 C3)을 분리해야 하는데 이를 막아버림

### Phase 121 v2: 조건부 Pitch 변화 억제
**아이디어**: 짧은 간격(2슬롯 이내)에서 같은 pitch면 onset 억제
```typescript
// 최근 onset으로부터 2슬롯 이내 + 같은 pitch → 억제
if (distFromLastOnset <= 2 && samePitch) suppress = true;
```

**결과**: ❌ 미미한 하락
| 지표 | 이전 | 이후 | 변화 |
|------|------|------|------|
| 종합 | 73.2% | 73.1% | -0.1% |

### Phase 121 v3: 더 보수적인 억제 (1슬롯)
**결과**: ❌ 더 나빠짐
| 지표 | 이전 | 이후 | 변화 |
|------|------|------|------|
| 종합 | 73.2% | 72.9% | -0.3% |

### 결론
**Phase 121 전체 실패** - Pitch 변화 조건 접근법은 효과 없음
- v1: -5.6% (반복음 분리 불가)
- v2: -0.1%
- v3: -0.3%

**롤백 완료** - 기준선 복원: 73.2%

### 교훈
1. **Onset 억제는 위험** - 필요한 분리까지 막을 수 있음
2. **반복음 처리가 핵심 난제** - 같은 pitch의 연속 음표를 어떻게 분리할 것인가
3. **단순 규칙으로는 한계** - ML 기반 접근 또는 더 정교한 envelope 분석 필요

### 현재 상태
| 지표 | 값 |
|------|-----|
| 음정 | 80.3% |
| 타이밍 | 80.9% |
| 길이 | 58.4% |
| **종합** | **73.2%** |

### 향후 방향
- Onset Detection 개선보다는 **후처리** 강화 검토
- case_05/case_08의 특수한 패턴 분석 필요
- Energy envelope 분석 또는 spectral flux 접근 검토
