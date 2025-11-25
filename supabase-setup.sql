-- ============================================================================
-- JAMUS Supabase Setup Script
-- ============================================================================
-- This script sets up profiles table with auto-creation for new users
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Create profiles for all existing users (IMMEDIATE FIX)
-- ----------------------------------------------------------------------------
INSERT INTO public.profiles (id, nickname, stage, stage_progress, has_pro_badge, has_early_bird_badge)
SELECT
  id,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1)) as nickname,
  'Beginner' as stage,
  0 as stage_progress,
  false as has_pro_badge,
  false as has_early_bird_badge
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- 2. Create function to auto-create profiles for new users
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, stage, stage_progress, has_pro_badge, has_early_bird_badge)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1), 'User'),
    'Beginner',
    0,
    false,
    false
  );
  RETURN NEW;
EXCEPTION
  WHEN others THEN
    -- Log error but don't fail user creation
    RAISE WARNING 'Failed to create profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- 3. Create trigger to call function after user signup
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 4. Verify RLS policies exist
-- ----------------------------------------------------------------------------
-- Check if policies exist
DO $$
BEGIN
  -- Policy for SELECT
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can view own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own profile"
      ON public.profiles FOR SELECT
      USING (auth.uid() = id)';
  END IF;

  -- Policy for UPDATE
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own profile"
      ON public.profiles FOR UPDATE
      USING (auth.uid() = id)';
  END IF;
END $$;

-- 5. Verification Query
-- ----------------------------------------------------------------------------
-- Run this to verify everything is set up correctly
SELECT
  u.email,
  u.created_at as user_created,
  p.nickname,
  p.stage,
  p.stage_progress,
  CASE WHEN p.id IS NULL THEN '❌ Missing' ELSE '✅ Exists' END as profile_status
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC
LIMIT 10;

-- Expected output: All users should have profile_status = '✅ Exists'
