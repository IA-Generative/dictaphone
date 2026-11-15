import React, { useEffect } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { useTranslation } from 'react-i18next'
// @ts-expect-error  Logo SVG
import LogoWithName from '../assets/logo-single-line.svg'
import { useInsets } from '@/utils/useInsets'
import { AppText } from '@/components/AppText'
import { colors } from '@/components/colors'
import { useDeviceStore } from '@/features/device/store'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/navigation/types'

type LoginScreenProps = NativeStackScreenProps<RootStackParamList, 'Login'>

export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const { t } = useTranslation()
  const insets = useInsets()
  const enrollment = useDeviceStore((s) => s.enrollment)
  const force = route.params?.force === true

  useEffect(() => {
    if (enrollment && !force) {
      navigation.replace('Main')
    }
  }, [enrollment, force, navigation])

  if (enrollment && !force) {
    return null
  }

  const canCancel = force && navigation.canGoBack()

  return (
    <View style={[insets]}>
      <View style={styles.container}>
        <View style={styles.infoContainer}>
          <LogoWithName />
          <AppText variant="subtitle" size="md" align="center">
            {t('login.subtitle')}
          </AppText>
        </View>
        <View style={styles.loginContainer}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.primaryButtonPressed,
            ]}
            onPress={() => navigation.navigate('QrScan')}
          >
            <AppText variant="button">{t('login.scanQrCta')}</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && styles.secondaryButtonPressed,
            ]}
            onPress={() => navigation.navigate('CodeEntry')}
            testID="login-enter-code"
          >
            <AppText variant="button">{t('login.enterCodeCta')}</AppText>
          </Pressable>
          {canCancel && (
            <Pressable
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.cancelButton,
                pressed && styles.cancelButtonPressed,
              ]}
              onPress={() => navigation.goBack()}
            >
              <AppText variant="body" color={colors.textSecondary}>
                {t('common.cancel')}
              </AppText>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    paddingVertical: 30,
    paddingHorizontal: 10,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.backgroundBase,
  },
  infoContainer: {
    flexGrow: 1,
    marginHorizontal: 10,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  loginContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 40,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  secondaryButton: {
    width: '100%',
    backgroundColor: colors.secondary,
    borderRadius: 4,
    height: 40,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: colors.secondaryPressed,
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 4,
  },
  cancelButtonPressed: {
    opacity: 0.6,
  },
})
