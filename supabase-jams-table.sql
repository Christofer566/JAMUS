-- ============================================================================
-- JAMUS - JAMs Table Setup Script
-- ============================================================================
-- This script creates the jams table for storing user recordings
-- Run this in Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. Create jams table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.jams (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    song_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    audio_url TEXT NOT NULL,
    start_measure INTEGER NOT NULL,
    end_measure INTEGER NOT NULL,
    start_time DECIMAL(10, 3) NOT NULL,
    end_time DECIMAL(10, 3) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Create indexes for performance
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_jams_user_id ON public.jams(user_id);
CREATE INDEX IF NOT EXISTS idx_jams_song_id ON public.jams(song_id);
CREATE INDEX IF NOT EXISTS idx_jams_user_song ON public.jams(user_id, song_id);
CREATE INDEX IF NOT EXISTS idx_jams_created_at ON public.jams(created_at DESC);

-- 3. Enable Row Level Security
-- ----------------------------------------------------------------------------
ALTER TABLE public.jams ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
-- ----------------------------------------------------------------------------
-- Policy: Users can view their own jams
DROP POLICY IF EXISTS "Users can view own jams" ON public.jams;
CREATE POLICY "Users can view own jams"
    ON public.jams FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own jams
DROP POLICY IF EXISTS "Users can insert own jams" ON public.jams;
CREATE POLICY "Users can insert own jams"
    ON public.jams FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own jams
DROP POLICY IF EXISTS "Users can delete own jams" ON public.jams;
CREATE POLICY "Users can delete own jams"
    ON public.jams FOR DELETE
    USING (auth.uid() = user_id);

-- Policy: Users can update their own jams
DROP POLICY IF EXISTS "Users can update own jams" ON public.jams;
CREATE POLICY "Users can update own jams"
    ON public.jams FOR UPDATE
    USING (auth.uid() = user_id);

-- 5. Create Storage bucket for jams audio files
-- ----------------------------------------------------------------------------
-- Note: Run this in the SQL Editor if the bucket doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('jams', 'jams', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Storage RLS Policies
-- ----------------------------------------------------------------------------
-- Policy: Users can upload their own jams
DROP POLICY IF EXISTS "Users can upload own jams" ON storage.objects;
CREATE POLICY "Users can upload own jams"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'jams' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Policy: Users can view their own jams
DROP POLICY IF EXISTS "Users can view own jam files" ON storage.objects;
CREATE POLICY "Users can view own jam files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'jams' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Policy: Users can delete their own jams
DROP POLICY IF EXISTS "Users can delete own jam files" ON storage.objects;
CREATE POLICY "Users can delete own jam files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'jams' AND
        auth.uid()::text = (storage.foldername(name))[1]
    );

-- Policy: Public read access for jams (for sharing)
DROP POLICY IF EXISTS "Public read access for jams" ON storage.objects;
CREATE POLICY "Public read access for jams"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'jams');

-- 7. Verification Query
-- ----------------------------------------------------------------------------
-- Run this to verify the table was created correctly
SELECT
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'jams'
ORDER BY ordinal_position;

-- Check RLS policies
SELECT
    schemaname,
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename = 'jams';
