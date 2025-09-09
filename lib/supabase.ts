import { createClient } from '@supabase/supabase-js'
import { Database } from './database.types'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder-url.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'
 
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    redirectTo: process.env.NODE_ENV === 'production' 
      ? 'https://app.holohive.io' 
      : 'http://localhost:3000'
  }
}) 