-- =====================================================
-- JAMUS Supabase Schema
-- Task 6: feedback_sessions (피드백 수집)
-- Task 7: jams 테이블 확장 (BPM, duration)
-- =====================================================

-- =====================================================
-- PART 1: Task 6 - feedback_sessions 테이블
-- 피치 분석 정확도 개선을 위한 사용자 피드백 수집
-- =====================================================

CREATE TABLE IF NOT EXISTS public.feedback_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  jam_id UUID REFERENCES public.jams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id TEXT NOT NULL,

  -- 검출 결과 (JSONB)
  auto_detected_notes JSONB NOT NULL,
  final_edited_notes JSONB NOT NULL,
  note_changes JSONB NOT NULL DEFAULT '[]',

  -- 메트릭 (음표 단위)
  total_original_notes INTEGER NOT NULL,
  total_final_notes INTEGER NOT NULL,
  pitch_changed_notes INTEGER DEFAULT 0,
  position_changed_notes INTEGER DEFAULT 0,
  duration_changed_notes INTEGER DEFAULT 0,
  deleted_notes INTEGER DEFAULT 0,
  added_notes INTEGER DEFAULT 0,
  unchanged_notes INTEGER DEFAULT 0,

  -- 메타데이터
  bpm DECIMAL(6, 2),
  key TEXT,
  recording_duration DECIMAL(10, 3),
  edit_duration DECIMAL(10, 3),

  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- feedback_sessions 인덱스
CREATE INDEX IF NOT EXISTS idx_feedback_sessions_user
  ON public.feedback_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_sessions_song
  ON public.feedback_sessions(song_id);
CREATE INDEX IF NOT EXISTS idx_feedback_sessions_created
  ON public.feedback_sessions(created_at DESC);

-- feedback_sessions RLS
ALTER TABLE public.feedback_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feedback"
  ON public.feedback_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own feedback"
  ON public.feedback_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);


-- =====================================================
-- PART 2: Task 7 - jams 테이블 확장
-- BPM, duration 컬럼 추가 (이미 있으면 무시됨)
-- =====================================================

-- 기존 jams 테이블에 컬럼 추가
-- (이미 있으면 DO NOTHING)
DO $$
BEGIN
  -- BPM 컬럼 추가
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jams' AND column_name = 'bpm'
  ) THEN
    ALTER TABLE public.jams ADD COLUMN bpm DECIMAL(6, 2);
  END IF;

  -- duration 컬럼 추가 (녹음 길이, 초 단위)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jams' AND column_name = 'duration'
  ) THEN
    ALTER TABLE public.jams ADD COLUMN duration DECIMAL(10, 3);
  END IF;

  -- input_instrument 컬럼 추가 (목소리/허밍 등)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jams' AND column_name = 'input_instrument'
  ) THEN
    ALTER TABLE public.jams ADD COLUMN input_instrument TEXT DEFAULT 'voice';
  END IF;

  -- output_instrument 컬럼 추가 (피아노/기타 등)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jams' AND column_name = 'output_instrument'
  ) THEN
    ALTER TABLE public.jams ADD COLUMN output_instrument TEXT DEFAULT 'piano';
  END IF;
END $$;


-- =====================================================
-- PART 3: Storage 버킷 설정 안내
-- SQL Editor에서는 버킷 생성 불가, 아래 경로에서 수동 생성
-- =====================================================

-- Storage 버킷 생성은 Supabase Dashboard에서:
-- 1. Storage 메뉴 → New bucket
-- 2. 이름: "jams" (이미 있으면 스킵)
-- 3. Public bucket: ON (공개 재생용)
-- 4. File size limit: 50MB

-- 또는 "recordings" 버킷으로 새로 만들어도 됨


-- =====================================================
-- 분석 쿼리 예시
-- =====================================================

-- 1. 사용자별 녹음 통계
-- SELECT
--   user_id,
--   COUNT(*) AS jam_count,
--   AVG(duration) AS avg_duration,
--   SUM(duration) AS total_duration
-- FROM jams
-- GROUP BY user_id;

-- 2. BPM별 녹음 분포
-- SELECT
--   FLOOR(bpm / 10) * 10 AS bpm_range,
--   COUNT(*) AS count
-- FROM jams
-- WHERE bpm IS NOT NULL
-- GROUP BY bpm_range
-- ORDER BY bpm_range;

-- 3. 피드백 기반 정확도 분석
-- SELECT
--   song_id,
--   SUM(unchanged_notes)::float / NULLIF(SUM(total_original_notes), 0) * 100 AS accuracy
-- FROM feedback_sessions
-- GROUP BY song_id
-- ORDER BY accuracy DESC;
