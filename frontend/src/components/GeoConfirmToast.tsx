import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'
import { api } from '@/lib/api'

interface GeoDetectResponse {
  ip: string
  country_code: string
  country_name: string
  suggested_provider: string
  suggested_currency: string
  supported: boolean
  user_country: string | null
}

const STORAGE_KEY = 'campus_crown_geo_toast_dismissed'

export function GeoConfirmToast() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const hasTriggered = useRef(false)

  useEffect(() => {
    if (hasTriggered.current) return
    if (sessionStorage.getItem(STORAGE_KEY)) return

    hasTriggered.current = true

    api<GeoDetectResponse>('/geo/detect')
      .then((data) => {
        // Only prompt if user hasn't explicitly set a country in their profile
        if (data.user_country || (user && user.country)) return

        const providerLabel =
          data.suggested_provider === 'tng'
            ? 'MYR / Touch \'n Go'
            : data.suggested_provider === 'birr'
              ? 'ETB / Chapa'
              : `${data.suggested_currency}`

        toast(
          `Looks like you're in ${data.country_name} — use ${providerLabel}?`,
          {
            duration: 10000,
            action: {
              label: 'Yes',
              onClick: async () => {
                sessionStorage.setItem(STORAGE_KEY, 'true')
                if (user) {
                  try {
                    await api('/users/me', {
                      method: 'PATCH',
                      body: JSON.stringify({ country: data.country_code }),
                    })
                    toast.success(`Country set to ${data.country_name}`)
                  } catch {
                    toast.error('Could not set country')
                  }
                } else {
                  toast.success(`Currency set to ${data.suggested_currency}`)
                }
              },
            },
            cancel: {
              label: 'Choose manually',
              onClick: () => {
                sessionStorage.setItem(STORAGE_KEY, 'true')
                if (user) {
                  navigate('/me')
                }
              },
            },
          }
        )
      })
      .catch(() => {
        // Ignore geo errors silently
      })
  }, [user, navigate])

  return null
}
