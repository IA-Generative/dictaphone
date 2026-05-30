import { useCallback, useMemo } from 'react'
import { queryClient } from '@/api/queryClient'
import { type ApiUser } from './ApiUser'
import { clearDeviceCredentials } from '@/services/deviceTokenService'
import { useDeviceStore } from '@/features/device/store'
import { terminateAnalyticsSession } from '@/features/analytics/hooks/useAnalytics'
import { useUserStore } from '@/services/userStore'

type TUserInfo = {
  refetch: () => void
  isLoading: boolean
  logout: () => Promise<void>
} & (
  | {
      isLoggedIn: false
      user: undefined
      updateUser: undefined
    }
  | {
      isLoggedIn: true
      user: ApiUser
      updateUser: (userInfo: Pick<ApiUser, 'language'>) => void
    }
)

// In the mirai fork there is no per-user account: pairing is by device.
// "Logged in" therefore means "this device is enrolled" — derived from
// the persisted device store rather than from a /users/me/ call.
export const useUser = (): TUserInfo => {
  const { clearCachedUser } = useUserStore()
  const enrollment = useDeviceStore((s) => s.enrollment)
  const hasHydrated = useDeviceStore((s) => s.hasHydrated)

  const logout = useCallback(async () => {
    terminateAnalyticsSession()
    try {
      await clearDeviceCredentials()
    } finally {
      useDeviceStore.getState().clearEnrollment()
      clearCachedUser()
      queryClient.resetQueries()
    }
  }, [clearCachedUser])

  return useMemo<TUserInfo>(
    () =>
      ({
        refetch: () => {},
        logout,
        isLoading: !hasHydrated,
        ...(enrollment
          ? {
              isLoggedIn: true,
              user: {
                id: enrollment.qrToken,
                email: '',
                full_name: enrollment.simpleCode ?? 'Appareil enrôlé',
                language: 'fr-fr',
                timezone: 'Europe/Paris',
              } as ApiUser,
              updateUser: () => {},
            }
          : { isLoggedIn: false, updateUser: undefined, user: undefined }),
      }) as TUserInfo,
    [enrollment, hasHydrated, logout]
  )
}
