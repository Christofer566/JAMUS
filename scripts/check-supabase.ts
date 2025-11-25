import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function checkSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not found in environment variables');
    return;
  }

  console.log('✅ Supabase URL:', supabaseUrl);
  console.log('✅ Supabase Key exists:', !!supabaseKey);

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Check profiles table
  console.log('\n🔍 Checking profiles table...');
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('*')
    .limit(1);

  if (profilesError) {
    console.error('❌ Profiles table error:', profilesError);
    console.log('\n📋 To fix this, run the following SQL in Supabase SQL Editor:');
    console.log(`
-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  nickname text,
  stage text DEFAULT 'Beginner',
  stage_progress integer DEFAULT 0,
  has_pro_badge boolean DEFAULT false,
  has_early_bird_badge boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create trigger to auto-create profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, stage, stage_progress)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'Beginner',
    0
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    `);
  } else {
    console.log('✅ Profiles table exists');
    console.log('📊 Sample data:', profiles);
  }

  // Check songs table with music data
  console.log('\n🔍 Checking songs table for BPM data...');
  const { data: songs, error: songsError } = await supabase
    .from('songs')
    .select('id, title, bpm, time_signature, structure_data')
    .limit(3);

  if (songsError) {
    console.error('❌ Songs table error:', songsError);
  } else {
    console.log('✅ Songs table exists');
    songs?.forEach(song => {
      console.log(`\n🎵 ${song.title}:`);
      console.log(`   - BPM: ${song.bpm || '❌ Missing'}`);
      console.log(`   - Time Signature: ${song.time_signature || '❌ Missing'}`);
      console.log(`   - Structure Data: ${song.structure_data ? '✅' : '❌ Missing'}`);
    });

    if (songs?.some(s => !s.bpm || !s.time_signature || !s.structure_data)) {
      console.log('\n📋 To add BPM data, run the SQL from the prompt (Autumn Leaves, Blue Bossa, All of Me)');
    }
  }
}

checkSupabase().catch(console.error);
