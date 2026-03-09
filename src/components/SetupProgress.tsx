import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface SetupProgressProps {
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export default function SetupProgress({ label, status }: SetupProgressProps) {
  function renderIcon() {
    switch (status) {
      case 'done':
        return <Icon name="check-circle" size={20} color="#22c55e" />;
      case 'active':
        return <ActivityIndicator size="small" color="#6366f1" />;
      case 'error':
        return <Icon name="close-circle" size={20} color="#ef4444" />;
      default:
        return <Icon name="circle-outline" size={20} color="#4b5563" />;
    }
  }

  function getTextColor(): string {
    switch (status) {
      case 'done': return '#22c55e';
      case 'active': return '#ffffff';
      case 'error': return '#ef4444';
      default: return '#4b5563';
    }
  }

  return (
    <View className="flex-row items-center py-2.5">
      <View className="w-6 items-center">{renderIcon()}</View>
      <Text className="ml-3 text-base" style={{ color: getTextColor() }}>
        {label}
      </Text>
    </View>
  );
}
