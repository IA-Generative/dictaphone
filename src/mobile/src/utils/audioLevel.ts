// A normal speaking voice sits around RMS 0.05-0.15: boost it so speech fills
// most of the meter without clipping it.
const LEVEL_GAIN = 4

/** Maps a buffer of PCM samples (-1..1) to a 0..1 meter level (boosted RMS). */
export const audioLevelFromSamples = (samples: ArrayLike<number>): number => {
  if (samples.length === 0) return 0
  let sumSquares = 0
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i]
  }
  const level = Math.sqrt(sumSquares / samples.length) * LEVEL_GAIN
  return Number.isFinite(level) ? Math.min(1, level) : 0
}
