import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAppStore } from '../store/appStore';
import AppCard from '../components/AppCard';
import { App } from '../types';

interface DashboardScreenProps {
  navigation: any;
}

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { apps, engineConnected, isLoading, init, fetchApps } = useAppStore();

  useEffect(() => {
    init();
    fetchApps();
    return () => {
      useAppStore.getState().cleanup();
    };
  }, []);

  const onRefresh = useCallback(async () => {
    await fetchApps();
  }, []);

  const runningCount = apps.filter((a) => a.status === 'running').length;

  function handleAppPress(app: App) {
    navigation.navigate('AppDetail', { appId: app.id, appName: app.name });
  }

  function handleAddApp() {
    if (apps.length >= 10) {
      Alert.alert('Limit Reached', 'Maximum 10 apps allowed. Delete an app first.');
      return;
    }
    navigation.navigate('AddApp');
  }

  function renderEmptyState() {
    return (
      <View className="flex-1 items-center justify-center py-20">
        <Icon name="rocket-launch-outline" size={64} color="#2a2a2a" />
        <Text className="text-white text-xl font-semibold mt-4 mb-2">
          Deploy your first app
        </Text>
        <Text className="text-[#9ca3af] text-center text-sm px-8 mb-6">
          Paste a GitHub repo URL and your app will be live in minutes
        </Text>
        <TouchableOpacity
          onPress={handleAddApp}
          className="bg-[#6366f1] px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold text-base">+ New App</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#0a0a0a]">
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pt-14 pb-4">
        <View>
          <Text className="text-white text-2xl font-bold">PocketDeploy</Text>
          <View className="flex-row items-center mt-1">
            <View
              className="w-2 h-2 rounded-full mr-2"
              style={{ backgroundColor: engineConnected ? '#22c55e' : '#ef4444' }}
            />
            <Text className="text-[#9ca3af] text-sm">
              {engineConnected
                ? `${runningCount} app${runningCount !== 1 ? 's' : ''} running`
                : 'Engine offline'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => navigation.navigate('Settings')}
          className="w-10 h-10 rounded-full bg-[#1a1a1a] items-center justify-center"
        >
          <Icon name="cog" size={22} color="#9ca3af" />
        </TouchableOpacity>
      </View>

      {/* App List */}
      <FlatList
        data={apps}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AppCard app={item} onPress={() => handleAppPress(item)} />
        )}
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100, flexGrow: apps.length === 0 ? 1 : undefined }}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor="#6366f1"
            colors={['#6366f1']}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* FAB - Add App */}
      {apps.length > 0 && (
        <TouchableOpacity
          onPress={handleAddApp}
          className="absolute bottom-8 right-6 w-14 h-14 rounded-full bg-[#6366f1] items-center justify-center"
          style={{
            shadowColor: '#6366f1',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          <Icon name="plus" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}
    </View>
  );
}
