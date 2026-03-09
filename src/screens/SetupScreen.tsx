import React, { useState, useEffect } from 'react';
import { View, Text, Animated } from 'react-native';
import { runSetup, getSetupSteps, SetupStepId } from '../engine/BinaryManager';
import SetupProgress from '../components/SetupProgress';

interface SetupScreenProps {
  navigation: any;
}

interface StepState {
  id: SetupStepId;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export default function SetupScreen({ navigation }: SetupScreenProps) {
  const [steps, setSteps] = useState<StepState[]>(getSetupSteps());
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const progressAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    startSetup();
  }, []);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [progress]);

  async function startSetup() {
    try {
      await runSetup((stepId, status, progressVal) => {
        setSteps((prev) =>
          prev.map((s) => (s.id === stepId ? { ...s, status } : s))
        );
        if (progressVal !== undefined) {
          setProgress(progressVal);
        }
      });

      // Small delay for the animation to complete
      setTimeout(() => {
        navigation.replace('Dashboard');
      }, 1000);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View className="flex-1 bg-[#0a0a0a] px-6 pt-20">
      {/* Header */}
      <View className="items-center mb-10">
        <Text className="text-white text-3xl font-bold mb-2">PocketDeploy</Text>
        <Text className="text-[#9ca3af] text-base text-center">
          Setting up your environment
        </Text>
        <Text className="text-[#6366f1] text-sm mt-1">
          This only happens once!
        </Text>
      </View>

      {/* Steps */}
      <View className="mb-8">
        {steps.map((step) => (
          <SetupProgress key={step.id} label={step.label} status={step.status} />
        ))}
      </View>

      {/* Progress Bar */}
      <View className="h-2 bg-[#1a1a1a] rounded-full overflow-hidden mb-4">
        <Animated.View
          style={{ width: progressWidth, height: '100%', backgroundColor: '#6366f1', borderRadius: 9999 }}
        />
      </View>
      <Text className="text-[#9ca3af] text-center text-sm">{Math.round(progress)}%</Text>

      {/* Error */}
      {error && (
        <View className="mt-6 bg-[#1a1a1a] border border-[#ef4444] rounded-xl p-4">
          <Text className="text-[#ef4444] font-semibold mb-1">Setup Failed</Text>
          <Text className="text-[#9ca3af] text-sm">{error}</Text>
        </View>
      )}
    </View>
  );
}
