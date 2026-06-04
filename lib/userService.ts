import { supabase } from './supabase'
import { Database } from './database.types'

type UserProfile = Database['public']['Tables']['users']['Row']
type UserInsert = Database['public']['Tables']['users']['Insert']
type UserUpdate = Database['public']['Tables']['users']['Update']

export class UserService {
  /**
   * Create a new user profile (for OAuth users)
   */
  static async createUserProfile(userData: UserInsert): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single()

      if (error) {
        console.error('Error creating user profile:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error creating user profile:', error)
      return null
    }
  }

  /**
   * Get or create user profile (useful for OAuth flows)
   */
  static async getOrCreateUserProfile(
    userId: string,
    email: string,
    name?: string
  ): Promise<UserProfile | null> {
    // First try to get existing profile
    const existingProfile = await this.getUserProfile(userId)
    if (existingProfile) {
      return existingProfile
    }

    // Create new profile for OAuth user — inactive until admin approves
    return this.createUserProfile({
      id: userId,
      email,
      name: name || email.split('@')[0],
      role: 'member',
      is_active: false,
    })
  }

  /**
   * Get user profile by ID
   */
  static async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single()

      if (error) {
        console.error('Error fetching user profile:', error)
        return null
      }

      return data
    } catch (error) {
      console.error('Error fetching user profile:', error)
      return null
    }
  }

  /**
   * Get all users (admin only) — INCLUDES inactive/pending users.
   * Use this only on admin-management surfaces (e.g. `/team`) where the
   * caller needs to see who's awaiting approval or has been deactivated.
   *
   * For every other use case — assignment pickers, filter dropdowns,
   * @-mention lists, etc. — use `getActiveUsers()` instead, which hides
   * unapproved sign-ups and former teammates so picker UIs don't list
   * people who can't actually log in.
   */
  static async getAllUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching users:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching users:', error)
      return []
    }
  }

  /**
   * Get active users only — filters out pending sign-ups (is_active=false
   * by default on OAuth create) and deactivated teammates.
   *
   * This is the right default for any UI that lists users as a target —
   * assignment dropdowns, @-mention pickers, filter selects, viewer-as
   * pickers, etc. — because surfacing an inactive user there means the
   * action will either fail (user can't be assigned a task) or land in a
   * dead inbox (notifications to someone who can't log in).
   *
   * Added 2026-06-03 after the meetings-page picker showed Andy a
   * cluttered list of pending and ex-teammates.
   */
  static async getActiveUsers(): Promise<UserProfile[]> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching active users:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('Error fetching active users:', error)
      return []
    }
  }

  /**
   * Update user profile
   */
  static async updateUserProfile(userId: string, updates: UserUpdate): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)

      if (error) {
        console.error('Error updating user profile:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error updating user profile:', error)
      return false
    }
  }

  /**
   * Update user role (super_admin only)
   */
  static async updateUserRole(userId: string, newRole: 'super_admin' | 'admin' | 'member' | 'guest'): Promise<boolean> {
    return this.updateUserProfile(userId, { role: newRole })
  }

  /**
   * Check if current user is super admin
   */
  static async isCurrentUserSuperAdmin(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const profile = await this.getUserProfile(user.id)
      return profile?.role === 'super_admin' && profile?.is_active === true
    } catch (error) {
      console.error('Error checking super admin status:', error)
      return false
    }
  }

  /**
   * Deactivate user (admin only)
   */
  static async deactivateUser(userId: string): Promise<boolean> {
    return this.updateUserProfile(userId, { is_active: false })
  }

  /**
   * Activate user (admin only)
   */
  static async activateUser(userId: string): Promise<boolean> {
    return this.updateUserProfile(userId, { is_active: true })
  }

  /**
   * Delete user record (admin only, for rejecting pending sign-ups)
   */
  static async deleteUser(userId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', userId)

      if (error) {
        console.error('Error deleting user:', error)
        return false
      }

      return true
    } catch (error) {
      console.error('Error deleting user:', error)
      return false
    }
  }

  /**
   * Check if current user is admin
   */
  static async isCurrentUserAdmin(): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return false

      const profile = await this.getUserProfile(user.id)
      return (profile?.role === 'admin' || profile?.role === 'super_admin') && profile?.is_active === true
    } catch (error) {
      console.error('Error checking admin status:', error)
      return false
    }
  }

  /**
   * Get current user's profile
   */
  static async getCurrentUserProfile(): Promise<UserProfile | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      return await this.getUserProfile(user.id)
    } catch (error) {
      console.error('Error getting current user profile:', error)
      return null
    }
  }
}

export type { UserProfile, UserInsert, UserUpdate } 