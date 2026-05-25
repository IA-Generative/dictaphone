import { useMutation, useQuery } from '@tanstack/react-query'
import { keys } from '@/api/queryKeys'
import { fetchUser } from './fetchUser'
import { type ApiUser } from './ApiUser'
import { useCallback, useEffect, useMemo } from 'react'
import { updateUserPreferences } from '@/features/auth/api/updateUserPreferences'
import { queryClient } from '@/api/queryClient'
import { clearDeviceCredentials } from '@/services/deviceTokenService'
import { useDeviceStore } from '@/features/device/store'
import {
  startAnalyticsSession,
  terminateAnalyticsSession,
} from '@/features/analytics/hooks/useAnalytics'
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

/**
 * returns info about currently logged-in user
 *
 * `isLoggedIn` is undefined while query is loading and true/false when it's done
 */
export const useUser = () => {
  const { setCachedUser, clearCachedUser } = useUserStore()

  const query = useQuery({
    queryKey: [keys.user],
    queryFn: () => fetchUser(),
    staleTime: Infinity,
  })

  const updateUserQuery = useMutation({
    mutationFn: updateUserPreferences,
    onSuccess: (data) => {
      setCachedUser(data)
      queryClient.setQueryData([keys.user], data)
    },
  })

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const updateUser = (newData: Pick<ApiUser, 'language'>) => {
    if (!query.data) return

    const currentUser = query.data as ApiUser
    updateUserQuery.mutate({
      user: {
        id: currentUser.id,
        timezone: currentUser.timezone,
        ...newData,
      },
    })
  }

  useEffect(() => {
    if (query?.data) {
      startAnalyticsSession(query.data)
      // initializeSupportSession(query.data)
    }
  }, [query.data])

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

  const isLoggedIn = query.status === 'success' && query.data !== false

  return useMemo<TUserInfo>(
    () =>
      ({
        refetch: query.refetch,
        logout,
        ...(isLoggedIn
          ? {
              isLoggedIn: true,
              user: query.data as ApiUser,
              updateUser,
            }
          : { isLoggedIn: false, updateUser: undefined, user: undefined }),
        isLoading: query.isLoading,
      }) as TUserInfo,
    [query.refetch, query.data, query.isLoading, isLoggedIn, logout, updateUser]
  )
}
