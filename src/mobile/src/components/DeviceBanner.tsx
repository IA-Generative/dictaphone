import React from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AppText } from '@/components/AppText'
import { colors } from '@/components/colors'
import { useDeviceStore } from '@/features/device/store'
import { useDeviceSessionSync } from '@/features/device/useDeviceSessionSync'
import type { RootStackParamList } from '@/navigation/types'

export function DeviceBanner() {
  const { t } = useTranslation()
  const enrollment = useDeviceStore((s) => s.enrollment)
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  useDeviceSessionSync()

  if (!enrollment) return null

  return (
    <View style={styles.banner}>
      <View style={styles.codeBlock}>
        <AppText variant="muted" size="xs">
          {t('deviceBanner.label')}
        </AppText>
        <AppText variant="bodyBold" size="md">
          {enrollment.simpleCode ?? '…'}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.changeButton,
          pressed && styles.changeButtonPressed,
        ]}
        onPress={() => navigation.navigate('Login', { force: true })}
      >
        <AppText variant="button" size="sm" color="white">
          {t('deviceBanner.change')}
        </AppText>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.backgroundSubtle,
    borderWidth: 1,
    borderColor: colors.surfacePrimary,
    gap: 12,
  },
  codeBlock: {
    flexDirection: 'column',
    gap: 2,
  },
  changeButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  changeButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
})
