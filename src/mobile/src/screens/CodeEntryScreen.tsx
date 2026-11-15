import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useTranslation } from 'react-i18next'
import { AppText } from '@/components/AppText'
import { colors } from '@/components/colors'
import { useInsets } from '@/utils/useInsets'
import { useResetNavigationHistory } from '@/navigation/useRestNavigationHistory'
import { enrollDevice } from '@/features/device/api/enroll'
import { resolveSimpleCode } from '@/features/device/api/resolveSimpleCode'
import { useDeviceStore } from '@/features/device/store'

export default function CodeEntryScreen() {
  const { t } = useTranslation()
  const insets = useInsets()
  const resetNavigation = useResetNavigationHistory()
  const navigation = useNavigation()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const onSubmit = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const qrToken = await resolveSimpleCode(code)
      if (!qrToken) {
        setError(t('codeEntry.invalidCode'))
        return
      }
      await enrollDevice(qrToken)
      useDeviceStore.getState().setEnrollment({
        qrToken,
        simpleCode: code.trim().toUpperCase(),
        enrolledAtTs: Date.now(),
      })
      resetNavigation('Main')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [code, resetNavigation, t])

  return (
    <View style={[insets]}>
      <View style={styles.container}>
        <AppText variant="heading" size="lg" align="center">
          {t('codeEntry.title')}
        </AppText>
        <AppText variant="body" size="md" align="center">
          {t('codeEntry.subtitle')}
        </AppText>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder={t('codeEntry.placeholder')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={12}
          style={styles.input}
          editable={!loading}
        />
        {error ? (
          <AppText variant="body" size="sm" align="center">
            {error}
          </AppText>
        ) : null}
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            (loading || !code) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => {
            void onSubmit()
          }}
          disabled={loading || !code}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <AppText variant="button">{t('codeEntry.submit')}</AppText>
          )}
        </Pressable>
        {navigation.canGoBack() && (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.cancelButton,
              pressed && styles.cancelButtonPressed,
            ]}
            onPress={() => navigation.goBack()}
            disabled={loading}
          >
            <AppText variant="body" align="center" color={colors.textSecondary}>
              {t('common.cancel')}
            </AppText>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.backgroundNeutralSecondary,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 20,
    letterSpacing: 4,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 4,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonPressed: {
    backgroundColor: colors.primaryPressed,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  cancelButton: {
    paddingVertical: 10,
    marginTop: 4,
  },
  cancelButtonPressed: {
    opacity: 0.6,
  },
})
