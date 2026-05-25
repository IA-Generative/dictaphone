import { Pressable, StyleSheet } from 'react-native'
import React, { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { AppText } from './AppText'
import { colors } from '@/components/colors'
import type { RootStackParamList } from '@/navigation/types'

export function LoginButton() {
  const { t } = useTranslation()
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  const handleLogin = useCallback(() => {
    navigation.navigate('Login')
  }, [navigation])

  return (
    <Pressable
      style={({ pressed }) => [
        styles.loginButton,
        pressed && styles.loginButtonPressed,
      ]}
      onPress={handleLogin}
    >
      <AppText variant="button">{t('login.loginCta')}</AppText>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  loginButton: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
    height: 40,
    paddingVertical: 0,
    display: 'flex',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginButtonPressed: {
    backgroundColor: colors.primaryPressed,
  },
})
