import './src/i18n/index'
import React from 'react'
import { StatusBar } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import RecordingScreen from '@/screens/RecordingScreen'
import RecordingsScreen from './src/screens/RecordingsScreen'
import { queryClient } from '@/api/queryClient'
import { QueryClientProvider } from '@tanstack/react-query'
import BootSplash from 'react-native-bootsplash'
import LoginScreen from '@/screens/LoginScreen'
import QrScanScreen from '@/screens/QrScanScreen'
import CodeEntryScreen from '@/screens/CodeEntryScreen'
import RecordingDetailsScreen from '@/screens/RecordingDetailsScreen'
import InfoScreen from '@/screens/InfoScreen'
import type { RootStackParamList } from '@/navigation/types'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { AppInitialization } from '@/components/AppInitialization'
import { logPosthogScreenChange } from '@/features/analytics/hooks/useAnalytics'
import { UpdateModal } from '@/features/config/UpdateModal'

const RootStack = createNativeStackNavigator<RootStackParamList>()

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AppInitialization>
          <StatusBar barStyle="dark-content" />
          <NavigationContainer
            onReady={() => {
              BootSplash.hide()
            }}
            fallback={<></>}
            onStateChange={(state) => {
              const route = state?.routes[state.index]?.name
              if (route) {
                logPosthogScreenChange(route)
              }
            }}
          >
            <RootStack.Navigator screenOptions={{ headerShown: false }}>
              <RootStack.Screen name="Login" component={LoginScreen} />
              <RootStack.Screen name="QrScan" component={QrScanScreen} />
              <RootStack.Screen
                name="CodeEntry"
                component={CodeEntryScreen}
              />
              <RootStack.Screen name="Main" component={RecordingsScreen} />
              <RootStack.Screen name="Info" component={InfoScreen} />
              <RootStack.Screen
                name="RecordingInProgress"
                component={RecordingScreen}
                options={{ gestureEnabled: false }}
              />
              <RootStack.Screen
                name="RecordingDetails"
                component={RecordingDetailsScreen}
              />
            </RootStack.Navigator>
          </NavigationContainer>
          <UpdateModal />
        </AppInitialization>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

export default App
