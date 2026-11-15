import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startDeviceHeartbeat } from './deviceHeartbeatLoop'

const appState = () => {
  let listener: ((state: string) => void) | undefined
  const remove = vi.fn()
  return {
    subscribe: (l: (state: string) => void) => {
      listener = l
      return { remove }
    },
    change: (state: string) => listener?.(state),
    remove,
  }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('startDeviceHeartbeat', () => {
  it('beats now, periodically and when the app comes back', () => {
    const beat = vi.fn().mockResolvedValue({})
    const state = appState()
    startDeviceHeartbeat(beat, state.subscribe, 1000)
    expect(beat).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(2000)
    expect(beat).toHaveBeenCalledTimes(3)
    state.change('background')
    expect(beat).toHaveBeenCalledTimes(3)
    state.change('active')
    expect(beat).toHaveBeenCalledTimes(4)
  })

  it('survives a failed beat', async () => {
    const beat = vi.fn().mockRejectedValue(new Error('offline'))
    startDeviceHeartbeat(beat, appState().subscribe, 1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(beat).toHaveBeenCalledTimes(2)
  })

  it('stops on cleanup', () => {
    const beat = vi.fn().mockResolvedValue({})
    const state = appState()
    const stop = startDeviceHeartbeat(beat, state.subscribe, 1000)
    stop()
    vi.advanceTimersByTime(5000)
    expect(beat).toHaveBeenCalledTimes(1)
    expect(state.remove).toHaveBeenCalledOnce()
  })
})
