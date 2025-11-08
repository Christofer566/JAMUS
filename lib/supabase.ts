import { createBrowserClient } from '@supabase/ssr'

/**
 * Creates and returns a Supabase browser client instance.
 * This client properly handles cookies for authentication.
 * 
 * @returns A Supabase browser client instance configured with environment variables
 * @throws Error if required environment variables are not set
 */
export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Check if environment variables exist
  if (!supabaseUrl) {
    throw new Error(
      'Missing environment variable: NEXT_PUBLIC_SUPABASE_URL. ' +
      'Please add it to your .env.local file.'
    )
  }

  if (!supabaseAnonKey) {
    throw new Error(
      'Missing environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Please add it to your .env.local file.'
    )
  }

  // Validate that the URL is not empty
  if (supabaseUrl.trim() === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL cannot be empty.')
  }

  // Validate that the anon key is not empty
  if (supabaseAnonKey.trim() === '') {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY cannot be empty.')
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}
