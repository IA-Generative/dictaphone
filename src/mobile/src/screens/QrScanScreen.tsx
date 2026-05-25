import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from 'react-native'
import {
  Camera,
  useCameraDevice,
  useCodeScanner,
} from 'react-native-vision-camera'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { AppText } from '@/components/AppText'
import { colors } from '@/components/colors'
import { useResetNavigationHistory } from '@/navigation/useRestNavigationHistory'
import { extractQrToken } from '@/features/device/extractQrToken'
import { enrollDevice } from '@/features/device/api/enroll'
import { useDeviceStore } from '@/features/device/store'

type Status = 'requesting' | 'denied' | 'scanning' | 'enrolling' | 'error'

export default function QrScanScreen() {
  const { t } = useTranslation()
  const safeInsets = useSafeAreaInsets()
  const insets = {
    paddingTop: safeInsets.top + 16,
    paddingBottom: safeInsets.bottom + 16,
    paddingLeft: safeInsets.left + 16,
    paddingRight: safeInsets.right + 16,
  }
  const device = useCameraDevice('back')
  const [status, setStatus] = useState<Status>('requesting')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const handledRef = useRef(false)
  const resetNavigation = useResetNavigationHistory()

  useEffect(() => {
    Camera.requestCameraPermission().then((perm) => {
      setStatus(perm === 'granted' ? 'scanning' : 'denied')
    })
  }, [])

  const handleScan = useCallback(
    async (rawValue: string) => {
      if (handledRef.current) return
      const qrToken = extractQrToken(rawValue)
      if (!qrToken) {
        setErrorMessage(t('qrScan.invalidCode'))
        setStatus('error')
        handledRef.current = true
        return
      }
      handledRef.current = true
      setStatus('enrolling')
      try {
        await enrollDevice(qrToken)
        useDeviceStore.getState().setEnrollment({
          qrToken,
          enrolledAtTs: Date.now(),
        })
        resetNavigation('Main')
      } catch (e) {
        setErrorMessage(e instanceof Error ? e.message : String(e))
        setStatus('error')
      }
    },
    [resetNavigation, t]
  )

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      const first = codes[0]?.value
      if (first) {
        void handleScan(first)
      }
    },
  })

  const retry = useCallback(() => {
    handledRef.current = false
    setErrorMessage('')
    setStatus('scanning')
  }, [])

  if (status === 'requesting') {
    return (
      <View style={[styles.center, insets]}>
        <ActivityIndicator />
      </View>
    )
  }

  if (status === 'denied') {
    return (
      <View style={[styles.center, insets]}>
        <AppText variant="body" size="md" align="center">
          {t('qrScan.permissionDenied')}
        </AppText>
        <Pressable
          style={styles.button}
          onPress={() => {
            void Linking.openSettings()
          }}
        >
          <AppText variant="button">{t('qrScan.openSettings')}</AppText>
        </Pressable>
      </View>
    )
  }

  if (status === 'enrolling') {
    return (
      <View style={[styles.center, insets]}>
        <ActivityIndicator />
        <AppText variant="body" size="md" align="center">
          {t('qrScan.enrolling')}
        </AppText>
      </View>
    )
  }

  if (status === 'error') {
    return (
      <View style={[styles.center, insets]}>
        <AppText variant="body" size="md" align="center">
          {errorMessage}
        </AppText>
        <Pressable style={styles.button} onPress={retry}>
          <AppText variant="button">{t('qrScan.retry')}</AppText>
        </Pressable>
      </View>
    )
  }

  if (!device) {
    return (
      <View style={[styles.center, insets]}>
        <AppText variant="body" size="md" align="center">
          {t('qrScan.noCamera')}
        </AppText>
      </View>
    )
  }

  return (
    <View style={styles.cameraContainer}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        codeScanner={codeScanner}
      />
      <View style={[styles.overlay, insets]} pointerEvents="none">
        <View style={styles.viewfinder} />
        <AppText variant="body" size="md" align="center" style={styles.hint}>
          {t('qrScan.hint')}
        </AppText>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  viewfinder: {
    width: 240,
    height: 240,
    borderColor: 'white',
    borderWidth: 2,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: {
    color: 'white',
    paddingHorizontal: 24,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 24,
    backgroundColor: colors.backgroundBase,
  },
  button: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 4,
  },
})
