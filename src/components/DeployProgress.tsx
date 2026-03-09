import React from 'react';
import { View, Text } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AppStatus } from '../types';

interface DeployStep {
  status: AppStatus;
  label: string;
  icon: string;
}

const DEPLOY_STEPS: DeployStep[] = [
  { status: 'cloning', label: 'Cloning repository', icon: 'source-branch' },
  { status: 'installing', label: 'Installing dependencies', icon: 'package-down' },
  { status: 'building', label: 'Building project', icon: 'hammer-wrench' },
  { status: 'starting', label: 'Starting app', icon: 'play-circle' },
  { status: 'running', label: 'Live!', icon: 'check-circle' },
];

const STATUS_ORDER: AppStatus[] = ['cloning', 'installing', 'building', 'starting', 'running'];

interface DeployProgressProps {
  currentStatus: AppStatus;
  error?: string | null;
}

export default function DeployProgress({ currentStatus, error }: DeployProgressProps) {
  const currentIndex = STATUS_ORDER.indexOf(currentStatus);

  function getStepState(step: DeployStep, index: number): 'done' | 'active' | 'pending' | 'error' {
    if (currentStatus === 'error' && index === currentIndex) return 'error';
    if (currentStatus === 'error' && index < currentIndex) return 'done';
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'active';
    return 'pending';
  }

  function getStepColor(state: string): string {
    switch (state) {
      case 'done': return '#22c55e';
      case 'active': return '#eab308';
      case 'error': return '#ef4444';
      default: return '#4b5563';
    }
  }

  function getStepIcon(step: DeployStep, state: string): string {
    if (state === 'done') return 'check-circle';
    if (state === 'error') return 'close-circle';
    return step.icon;
  }

  return (
    <View className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4">
      {DEPLOY_STEPS.map((step, index) => {
        const state = getStepState(step, index);
        const color = getStepColor(state);
        const icon = getStepIcon(step, state);

        return (
          <View key={step.status}>
            <View className="flex-row items-center py-2">
              <Icon name={icon} size={20} color={color} />
              <Text
                className="ml-3 text-sm font-medium"
                style={{ color: state === 'pending' ? '#4b5563' : '#ffffff' }}
              >
                {step.label}
              </Text>
              {state === 'active' && (
                <Text className="ml-auto text-xs text-[#eab308]">In progress...</Text>
              )}
            </View>
            {/* Connector line */}
            {index < DEPLOY_STEPS.length - 1 && (
              <View className="ml-[9px] w-0.5 h-3" style={{ backgroundColor: index < currentIndex ? '#22c55e' : '#2a2a2a' }} />
            )}
          </View>
        );
      })}

      {/* Error message */}
      {error && currentStatus === 'error' && (
        <View className="mt-3 bg-[#0a0a0a] border border-[#ef4444] rounded-xl p-3">
          <Text className="text-[#ef4444] text-xs">{error}</Text>
        </View>
      )}
    </View>
  );
}
