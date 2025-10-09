import { createBrowserClient } from '@supabase/ssr'
import { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

// Use createBrowserClient from @supabase/ssr for cookie-based auth
// This allows server-side API routes to read the session from cookies
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey) 