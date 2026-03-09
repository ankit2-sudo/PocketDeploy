import React, { useEffect } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { isSetupComplete } from '../engine/BinaryManager';
import { engineClient } from '../engine/EngineClient';

interface SplashScreenProps {
  navigation: any;
}

export default function SplashScreen({ navigation }: SplashScreenProps) {
  useEffect(() => {
    checkSetup();
  }, []);

  async function checkSetup() {
    try {
      const setupDone = await isSetupComplete();

      if (!setupDone) {
        navigation.replace('Setup');
        return;
      }

      // Setup is done -- wait for engine to be ready
      const engineReady = await engineClient.waitForEngine(10000, 500);

      if (engineReady) {
        navigation.replace('Dashboard');
      } else {
        // Engine not responding -- might need to restart it
        // Navigate to dashboard anyway, it will show connection status
        navigation.replace('Dashboard');
      }
    } catch (err) {
      // If anything fails, go to setup
      navigation.replace('Setup');
    }
  }

  return (
    <View className="flex-1 bg-[#0a0a0a] items-center justify-center">
      <Text className="text-white text-3xl font-bold mb-2">PocketDeploy</Text>
      <Text className="text-[#9ca3af] text-base mb-8">Render.com in your pocket</Text>
      <ActivityIndicator size="large" color="#6366f1" />
    </View>
  );
}
