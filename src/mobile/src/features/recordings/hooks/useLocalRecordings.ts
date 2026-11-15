import { useMemo } from 'react'
import { useRecordingsStore } from '@/services/storage'

export const useLocalRecordings = () => {
  const { recordings, addRecording, updateRecording, deleteRecording } =
    useRecordingsStore()

  return useMemo(
    () => ({
      recordings,
      addRecording,
      updateRecording,
      deleteRecording,
    }),
    [recordings, addRecording, updateRecording, deleteRecording]
  )
}
