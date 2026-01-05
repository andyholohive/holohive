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
    name?: string,
    role: 'super_admin' | 'admin' | 'member' | 'guest' = 'member'
  ): Promise<UserProfile | null> {
    // First try to get existing profile
    const existingProfile = await this.getUserProfile(userId)
    if (existingProfile) {
      return existingProfile
    }

    // Create new profile for OAuth user
    return this.createUserProfile({
      id: userId,
      email,
      name: name || email.split('@')[0],
      role,
      is_active: true,
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
   * Get all users (admin only)
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