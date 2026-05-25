import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { mmkvStorage } from '@/services/index'

export type DeviceEnrollment = {
  qrToken: string
  simpleCode?: string
  retentionUntilTs?: number
  enrolledAtTs: number
}

export interface DeviceStore {
  hasHydrated: boolean
  enrollment: DeviceEnrollment | null
  setEnrollment: (enrollment: DeviceEnrollment) => void
  clearEnrollment: () => void
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    (set) => ({
      hasHydrated: false,
      enrollment: null,
      setEnrollment: (enrollment) => set({ enrollment }),
      clearEnrollment: () => set({ enrollment: null }),
    }),
    {
      name: 'mirai-device',
      storage: createJSONStorage(() => mmkvStorage),
      version: 1,
      onRehydrateStorage: () => () => {
        useDeviceStore.setState({ hasHydrated: true })
      },
    }
  )
)
