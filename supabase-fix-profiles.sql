-- ============================================================================
-- JAMUS - Fix Profiles Table Schema
-- ============================================================================
-- This script adds missing columns to profiles table
-- Run this FIRST, then run supabase-setup.sql
-- ============================================================================

-- 1. Add missing columns to profiles table (if they don't exist)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- Add nickname column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'nickname'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN nickname text;
    RAISE NOTICE 'Added column: nickname';
  ELSE
    RAISE NOTICE 'Column already exists: nickname';
  END IF;

  -- Add stage column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'stage'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stage text DEFAULT 'Beginner';
    RAISE NOTICE 'Added column: stage';
  ELSE
    RAISE NOTICE 'Column already exists: stage';
  END IF;

  -- Add stage_progress column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'stage_progress'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stage_progress integer DEFAULT 0;
    RAISE NOTICE 'Added column: stage_progress';
  ELSE
    RAISE NOTICE 'Column already exists: stage_progress';
  END IF;

  -- Add has_pro_badge column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'has_pro_badge'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN has_pro_badge boolean DEFAULT false;
    RAISE NOTICE 'Added column: has_pro_badge';
  ELSE
    RAISE NOTICE 'Column already exists: has_pro_badge';
  END IF;

  -- Add has_early_bird_badge column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'has_early_bird_badge'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN has_early_bird_badge boolean DEFAULT false;
    RAISE NOTICE 'Added column: has_early_bird_badge';
  ELSE
    RAISE NOTICE 'Column already exists: has_early_bird_badge';
  END IF;

  -- Add created_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;
    RAISE NOTICE 'Added column: created_at';
  ELSE
    RAISE NOTICE 'Column already exists: created_at';
  END IF;

  -- Add updated_at column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;
    RAISE NOTICE 'Added column: updated_at';
  ELSE
    RAISE NOTICE 'Column already exists: updated_at';
  END IF;
END $$;

-- 2. Verify table structure
-- ----------------------------------------------------------------------------
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
ORDER BY ordinal_position;

-- Expected columns:
-- - id (uuid, not null, primary key)
-- - nickname (text, nullable)
-- - stage (text, nullable, default 'Beginner')
-- - stage_progress (integer, nullable, default 0)
-- - has_pro_badge (boolean, nullable, default false)
-- - has_early_bird_badge (boolean, nullable, default false)
-- - created_at (timestamp with time zone, not null)
-- - updated_at (timestamp with time zone, not null)
