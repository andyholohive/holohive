'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { ChangelogService, Changelog } from '@/lib/changelogService'
import { useAuth } from './AuthContext'

interface ChangelogContextType {
  changelogs: Changelog[]
  unreadChangelogs: Changelog[]
  latestVersion: string | null
  loading: boolean
  markAsViewed: (ids: string[]) => Promise<void>
  refreshChangelogs: () => Promise<void>
}

const ChangelogContext = createContext<ChangelogContextType>({
  changelogs: [],
  unreadChangelogs: [],
  latestVersion: null,
  loading: true,
  markAsViewed: async () => {},
  refreshChangelogs: async () => {},
})

export const useChangelog = () => {
  const context = useContext(ChangelogContext)
  if (!context) {
    throw new Error('useChangelog must be used within a ChangelogProvider')
  }
  return context
}

export const ChangelogProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth()
  const [changelogs, setChangelogs] = useState<Changelog[]>([])
  const [unreadChangelogs, setUnreadChangelogs] = useState<Changelog[]>([])
  const [latestVersion, setLatestVersion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasFetched, setHasFetched] = useState(false)

  const fetchChangelogs = async () => {
    try {
      setLoading(true)
      const published = await ChangelogService.getPublishedChangelogs()
      setChangelogs(published)
      if (published.length > 0) {
        setLatestVersion(published[0].version)
      }

      // Fetch unread changelogs if user is logged in
      if (user) {
        const unread = await ChangelogService.getUnreadChangelogs()
        setUnreadChangelogs(unread)
      }
    } catch (error) {
      console.error('Error fetching changelogs:', error)
    } finally {
      setLoading(false)
      setHasFetched(true)
    }
  }

  // Fetch changelogs once when user is available
  useEffect(() => {
    if (user && !hasFetched) {
      fetchChangelogs()
    } else if (!user) {
      // Reset when user logs out
      setHasFetched(false)
      setUnreadChangelogs([])
    }
  }, [user, hasFetched])

  const markAsViewed = async (ids: string[]) => {
    try {
      await ChangelogService.markMultipleAsViewed(ids)
      // Remove the viewed changelogs from unread list
      setUnreadChangelogs(prev => prev.filter(c => !ids.includes(c.id)))
    } catch (error) {
      console.error('Error marking changelogs as viewed:', error)
    }
  }

  const refreshChangelogs = async () => {
    setHasFetched(false)
    await fetchChangelogs()
  }

  const value = {
    changelogs,
    unreadChangelogs,
    latestVersion,
    loading,
    markAsViewed,
    refreshChangelogs,
  }

  return <ChangelogContext.Provider value={value}>{children}</ChangelogContext.Provider>
}
