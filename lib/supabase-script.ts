// Load environment variables from .env.local for standalone scripts
import dotenv from 'dotenv';
import { resolve } from 'path';
import { createClient } from '@supabase/supabase-js';
import { Database } from './database.types';

// Load .env.local if running in Node.js (not Next.js)
if (typeof window === 'undefined' && !process.env.NEXT_RUNTIME) {
  dotenv.config({ path: resolve(__dirname, '../.env.local') });
}

/**
 * Create a Supabase client for standalone scripts
 * Uses service role key for admin access (bypasses RLS)
 *
 * IMPORTANT: Only use in server-side scripts, never expose service role key to client
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
}

if (!supabaseServiceKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable');
}

export const supabaseScript = createClient<Database>(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);
