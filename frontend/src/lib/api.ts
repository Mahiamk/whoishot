const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1'

export const BACKEND_BASE_URL = API_URL.replace(/\/api\/v1\/?$/, '')

export function mediaUrl(path: string | null | undefined): string {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  return `${BACKEND_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}


// Access token lives in memory only; sessionStorage lets a page refresh
// re-hydrate it so the /me call on load can restore the session.
let accessToken: string | null = sessionStorage.getItem('whoishot:token')

export function setToken(token: string | null) {
  accessToken = token
  if (token) sessionStorage.setItem('whoishot:token', token)
  else sessionStorage.removeItem('whoishot:token')
}

export function getToken(): string | null {
  return accessToken
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData
      ? {} // let the browser set the multipart boundary
      : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string>),
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

const LAST_CONTEST_KEY = 'whoishot:lastContest'

export function rememberContest(joinCode: string) {
  localStorage.setItem(LAST_CONTEST_KEY, joinCode)
}

export function lastContest(): string | null {
  return localStorage.getItem(LAST_CONTEST_KEY)
}
