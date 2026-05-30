import React from 'react'
import { StyleSheet, View } from 'react-native'
import { colors } from '@/components/colors'

const BAR_COUNT = 12

type VuMeterProps = {
  // 0 (silence) to 1 (clipping). Sub-zero or NaN values are clamped to 0.
  level: number
}

// Minimal LED-style level meter. Stateless, redraws on each level update.
// Blue for nominal levels, yellow above ~70 %, red above ~90 %.
export function VuMeter({ level }: VuMeterProps) {
  const safeLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0
  const litCount = Math.round(safeLevel * BAR_COUNT)

  return (
    <View style={styles.container}>
      {Array.from({ length: BAR_COUNT }, (_, i) => {
        const isLit = i < litCount
        let activeColor: string = colors.primary
        if (i >= BAR_COUNT * 0.9) activeColor = colors.errorSecondary
        else if (i >= BAR_COUNT * 0.7) activeColor = colors.warning
        return (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: isLit ? activeColor : colors.surfacePrimary },
            ]}
          />
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    height: 36,
    width: '100%',
  },
  bar: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 2,
    minWidth: 6,
  },
})
