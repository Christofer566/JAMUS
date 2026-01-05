-- =====================================================
-- feedback_sessions 테이블: 사용자 편집 피드백 수집
-- Pitch detection 정확도 개선을 위한 학습 데이터
--
-- 핵심: undoStack 횟수가 아닌 원본 vs 최종 비교
-- =====================================================

-- 기존 테이블 삭제 (개발 환경에서만)
-- DROP TABLE IF EXISTS public.feedback_sessions;

-- 테이블 생성
CREATE TABLE IF NOT EXISTS public.feedback_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  jam_id UUID REFERENCES public.jams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,

  -- 검출 결과 (JSONB)
  auto_detected_notes JSONB NOT NULL,
  final_edited_notes JSONB NOT NULL,
  note_changes JSONB NOT NULL DEFAULT '[]',  -- 개별 음표 변경 내역

  -- 메트릭 (음표 단위)
  total_original_notes INTEGER NOT NULL,
  total_final_notes INTEGER NOT NULL,
  pitch_changed_notes INTEGER DEFAULT 0,     -- 음정 변경된 음표 수
  position_changed_notes INTEGER DEFAULT 0,  -- 위치 변경된 음표 수
  duration_changed_notes INTEGER DEFAULT 0,  -- 길이 변경된 음표 수
  deleted_notes INTEGER DEFAULT 0,           -- 삭제된 음표 수
  added_notes INTEGER DEFAULT 0,             -- 추가된 음표 수
  unchanged_notes INTEGER DEFAULT 0,         -- 변경 없는 음표 수

  -- 메타데이터
  bpm DECIMAL(6, 2),
  key TEXT,
  recording_duration DECIMAL(10, 3),
  edit_duration DECIMAL(10, 3),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_feedback_sessions_user
  ON public.feedback_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_sessions_song
  ON public.feedback_sessions(song_id);
CREATE INDEX IF NOT EXISTS idx_feedback_sessions_created
  ON public.feedback_sessions(created_at DESC);

-- RLS 활성화
ALTER TABLE public.feedback_sessions ENABLE ROW LEVEL SECURITY;

-- RLS 정책
CREATE POLICY "Users can view own feedback"
  ON public.feedback_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON public.feedback_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- 분석 쿼리 예시
-- =====================================================

-- 1. 음정 수정이 많은 원본 pitch 분석
-- SELECT
--   change->>'original'->>'pitch' AS original_pitch,
--   change->>'final'->>'pitch' AS final_pitch,
--   COUNT(*) AS correction_count
-- FROM feedback_sessions,
--   jsonb_array_elements(note_changes) AS change
-- WHERE 'pitch' = ANY(ARRAY(SELECT jsonb_array_elements_text(change->'changes')))
-- GROUP BY original_pitch, final_pitch
-- ORDER BY correction_count DESC;

-- 2. 곡별 수정 통계
-- SELECT
--   song_id,
--   COUNT(*) AS session_count,
--   AVG(pitch_changed_notes) AS avg_pitch_changes,
--   AVG(duration_changed_notes) AS avg_duration_changes,
--   AVG(position_changed_notes) AS avg_position_changes
-- FROM feedback_sessions
-- GROUP BY song_id
-- ORDER BY session_count DESC;

-- 3. 전체 정확도 추정 (변경 없는 비율)
-- SELECT
--   song_id,
--   SUM(unchanged_notes)::float / NULLIF(SUM(total_original_notes), 0) * 100 AS accuracy_pct
-- FROM feedback_sessions
-- GROUP BY song_id;

-- 4. Duration 수정 패턴 (before/after slotCount 분석)
-- SELECT
--   (change->'original'->>'slotCount')::int AS original_slots,
--   (change->'final'->>'slotCount')::int AS final_slots,
--   COUNT(*) AS count
-- FROM feedback_sessions,
--   jsonb_array_elements(note_changes) AS change
-- WHERE 'duration' = ANY(ARRAY(SELECT jsonb_array_elements_text(change->'changes')))
-- GROUP BY original_slots, final_slots
-- ORDER BY count DESC;
