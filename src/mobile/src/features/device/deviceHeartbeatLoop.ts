export const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000 // 1h — well within the ~4h window

type AppStateSubscribe = (listener: (state: string) => void) => {
  remove: () => void
}

/**
 * Revalidates the device now, on every return to the foreground and on a
 * periodic timer. A failed beat is soft: it is retried on the next tick or
 * foreground. Returns the cleanup function.
 */
export function startDeviceHeartbeat(
  beat: () => Promise<unknown>,
  onAppStateChange: AppStateSubscribe,
  intervalMs = HEARTBEAT_INTERVAL_MS
): () => void {
  const run = () => {
    beat().catch(() => {})
  }
  run()
  const interval = setInterval(run, intervalMs)
  const subscription = onAppStateChange((state) => {
    if (state === 'active') run()
  })
  return () => {
    clearInterval(interval)
    subscription.remove()
  }
}
