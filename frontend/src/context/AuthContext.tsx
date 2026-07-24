import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, getToken, setToken } from '@/lib/api'

export interface User {
  id: number
  email: string
  display_name: string
  gender: 'F' | 'M'
  role: 'user' | 'admin'
  is_banned: boolean
  is_verified: boolean
  created_at: string
  country?: string | null
  detected_country?: string | null
}

interface AuthContextValue {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  // Resolves 'needs_gender' when the Google account is new — the caller
  // must collect a bracket and call again with it.
  loginWithGoogle: (
    credential: string,
    gender?: 'F' | 'M',
  ) => Promise<'ok' | 'needs_gender'>
  register: (data: {
    email: string
    password: string
    display_name: string
    gender: 'F' | 'M'
  }) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  // Refresh session from /me on app load if we still hold a token.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false)
      return
    }
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await api<{ access_token: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      setToken(access_token)
      // Drop every cached query from the previous identity — otherwise a
      // new user can see the prior user's data (e.g. rating sliders
      // initialized from their cached my_ratings instead of the neutral 5).
      queryClient.clear()
      setUser(await api<User>('/auth/me'))
    },
    [queryClient],
  )

  const loginWithGoogle = useCallback(
    async (credential: string, gender?: 'F' | 'M') => {
      const res = await api<{
        access_token: string | null
        needs_gender: boolean
      }>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential, gender: gender ?? null }),
      })
      if (res.needs_gender || !res.access_token) return 'needs_gender' as const
      setToken(res.access_token)
      queryClient.clear()
      setUser(await api<User>('/auth/me'))
      return 'ok' as const
    },
    [queryClient],
  )

  const register = useCallback(
    async (data: {
      email: string
      password: string
      display_name: string
      gender: 'F' | 'M'
    }) => {
      await api<User>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      await login(data.email, data.password)
    },
    [login],
  )

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
    queryClient.clear()
  }, [queryClient])

  const refreshUser = useCallback(async () => {
    if (!getToken()) return
    setUser(await api<User>('/auth/me'))
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginWithGoogle, register, logout, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
