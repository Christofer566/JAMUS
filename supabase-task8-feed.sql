-- =====================================================
-- Task 8: Feed 공유 기능
-- jams 테이블에 is_public 컬럼 추가
-- =====================================================

-- is_public 컬럼 추가 (기본값 false = 비공개)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jams' AND column_name = 'is_public'
  ) THEN
    ALTER TABLE public.jams ADD COLUMN is_public BOOLEAN DEFAULT false;
  END IF;

  -- shared_at: 공유된 시간 (공유 시 설정)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'jams' AND column_name = 'shared_at'
  ) THEN
    ALTER TABLE public.jams ADD COLUMN shared_at TIMESTAMPTZ;
  END IF;
END $$;

-- 인덱스: 공개된 JAM 빠르게 조회
CREATE INDEX IF NOT EXISTS idx_jams_public
  ON public.jams(is_public, shared_at DESC)
  WHERE is_public = true;

-- RLS 정책 업데이트: 공개된 JAM은 모든 사용자가 볼 수 있음
-- 기존 정책 삭제 후 재생성 (IF EXISTS 안전하게)
DO $$
BEGIN
  -- 기존 정책이 있으면 삭제
  DROP POLICY IF EXISTS "Users can view own jams" ON public.jams;
  DROP POLICY IF EXISTS "Anyone can view public jams" ON public.jams;
  DROP POLICY IF EXISTS "Users can view own or public jams" ON public.jams;
END $$;

-- 새 정책: 자신의 JAM 또는 공개된 JAM 조회 가능
CREATE POLICY "Users can view own or public jams"
  ON public.jams FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

-- =====================================================
-- 조회 쿼리 예시
-- =====================================================

-- 1. 공개된 JAM 목록 (Feed용)
-- SELECT j.*, u.display_name, u.avatar_url
-- FROM jams j
-- JOIN profiles u ON j.user_id = u.id
-- WHERE j.is_public = true
-- ORDER BY j.shared_at DESC
-- LIMIT 20;

-- 2. 특정 곡의 공개된 JAM
-- SELECT * FROM jams
-- WHERE song_id = 'autumn-leaves' AND is_public = true
-- ORDER BY shared_at DESC;
