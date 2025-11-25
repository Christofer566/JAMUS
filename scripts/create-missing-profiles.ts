import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function createMissingProfiles() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials not found');
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('🔍 Checking for users without profiles...\n');

  // Get all users from auth.users
  const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

  if (usersError) {
    console.error('❌ Error fetching users:', usersError.message);
    console.log('\n💡 This requires SUPABASE_SERVICE_ROLE_KEY in .env.local');
    console.log('   Get it from: Supabase Dashboard → Settings → API → service_role key');

    // Fallback: Show SQL to run manually
    console.log('\n📋 Run this SQL in Supabase SQL Editor instead:');
    console.log(`
-- Create profiles for all existing users
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

-- Verify
SELECT
  u.email,
  p.nickname,
  p.stage,
  p.stage_progress
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
ORDER BY u.created_at DESC;
    `);
    return;
  }

  if (!users || users.length === 0) {
    console.log('ℹ️  No users found in auth.users');
    return;
  }

  console.log(`✅ Found ${users.length} user(s)\n`);

  // Check which users don't have profiles
  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('id');

  const existingProfileIds = new Set(existingProfiles?.map(p => p.id) || []);
  const usersWithoutProfiles = users.filter(u => !existingProfileIds.has(u.id));

  if (usersWithoutProfiles.length === 0) {
    console.log('✅ All users already have profiles!');
    return;
  }

  console.log(`⚠️  Found ${usersWithoutProfiles.length} user(s) without profiles\n`);

  // Create profiles for users without them
  for (const user of usersWithoutProfiles) {
    const nickname = user.user_metadata?.name || user.email?.split('@')[0] || 'User';

    console.log(`📝 Creating profile for: ${user.email}`);

    const { error } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        nickname,
        stage: 'Beginner',
        stage_progress: 0,
        has_pro_badge: false,
        has_early_bird_badge: false,
      });

    if (error) {
      console.error(`   ❌ Error: ${error.message}`);
    } else {
      console.log(`   ✅ Profile created successfully`);
    }
  }

  console.log('\n🎉 Done! Refresh your browser to see the changes.');
}

createMissingProfiles().catch(console.error);
