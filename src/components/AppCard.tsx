import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { App } from '../types';
import { getProjectInfo, getStatusColor, getStatusLabel, isActiveStatus } from '../utils/commandMap';
import StatusBadge from './StatusBadge';

interface AppCardProps {
  app: App;
  onPress: () => void;
}

export default function AppCard({ app, onPress }: AppCardProps) {
  const projectInfo = getProjectInfo(app.projectType);
  const isActive = isActiveStatus(app.status);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl p-4 mb-3"
    >
      {/* Top Row: Name + Status */}
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center flex-1 mr-3">
          <View className="w-10 h-10 rounded-xl bg-[#2a2a2a] items-center justify-center mr-3">
            <Icon name={projectInfo.icon} size={22} color={projectInfo.color === '#000000' ? '#ffffff' : projectInfo.color} />
          </View>
          <View className="flex-1">
            <Text className="text-white font-semibold text-base" numberOfLines={1}>
              {app.name}
            </Text>
            <Text className="text-[#9ca3af] text-xs mt-0.5">
              {projectInfo.label} • :{app.port}
            </Text>
          </View>
        </View>
        <StatusBadge status={app.status} animated={isActive} />
      </View>

      {/* Tunnel URL */}
      {app.tunnelUrl ? (
        <View className="bg-[#0a0a0a] rounded-xl px-3 py-2 flex-row items-center">
          <Icon name="link" size={14} color="#6366f1" />
          <Text className="text-[#6366f1] text-xs ml-2 flex-1" numberOfLines={1}>
            {app.tunnelUrl}
          </Text>
          <Icon name="chevron-right" size={16} color="#9ca3af" />
        </View>
      ) : app.status === 'running' ? (
        <View className="bg-[#0a0a0a] rounded-xl px-3 py-2 flex-row items-center">
          <Icon name="loading" size={14} color="#9ca3af" />
          <Text className="text-[#9ca3af] text-xs ml-2">Tunnel starting...</Text>
        </View>
      ) : null}

      {/* Last deploy */}
      {app.lastDeploy && (
        <Text className="text-[#9ca3af] text-xs mt-2">
          Last deployed: {new Date(app.lastDeploy).toLocaleString()}
        </Text>
      )}
    </TouchableOpacity>
  );
}
