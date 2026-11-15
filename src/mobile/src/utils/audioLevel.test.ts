import { describe, expect, it } from 'vitest'
import { audioLevelFromSamples } from './audioLevel'

describe('audioLevelFromSamples', () => {
  it('is silent for an empty or zero buffer', () => {
    expect(audioLevelFromSamples(new Float32Array(0))).toBe(0)
    expect(audioLevelFromSamples(new Float32Array(2048))).toBe(0)
  })

  it('boosts the RMS of a speech-like signal', () => {
    expect(audioLevelFromSamples(new Float32Array(2048).fill(0.1))).toBeCloseTo(
      0.4
    )
    expect(audioLevelFromSamples([0.1, -0.1])).toBeCloseTo(0.4)
  })

  it('clamps loud and invalid signals', () => {
    expect(audioLevelFromSamples(new Float32Array(16).fill(1))).toBe(1)
    expect(audioLevelFromSamples([Number.NaN])).toBe(0)
  })
})
