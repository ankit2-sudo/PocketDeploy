import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useAppStore } from '../store/appStore';
import { engineClient } from '../engine/EngineClient';
import { StatusBadge } from '../components/StatusBadge';
import type { App, Deploy, EnvVar } from '../types';

type ParamList = { AppDetail: { appId: string } };

export default function AppDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<ParamList, 'AppDetail'>>();
  const { appId } = route.params;

  const { apps, deployApp, stopApp, startApp, restartApp, removeApp } = useAppStore();
  const app = apps.find(a => a.id === appId);

  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [envVars, setEnvVars] = useState<EnvVar[]>([]);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [showEnvForm, setShowEnvForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // ── Fetch deploys and env vars ─────────────────────────
  const fetchDetails = useCallback(async () => {
    try {
      const [d, app] = await Promise.all([
        engineClient.getDeploys(appId),
        engineClient.getApp(appId),
      ]);
      setDeploys(d.slice(0, 5));
    } catch {}
  }, [appId]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDetails();
    setRefreshing(false);
  };

  // ── Action handlers ────────────────────────────────────
  const handleAction = async (action: string, fn: () => Promise<void>) => {
    setActionLoading(action);
    try {
      await fn();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Action failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete App',
      `Are you sure you want to delete "${app?.name}"? This will stop the app, remove all files, and destroy the tunnel.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await removeApp(appId);
            navigation.goBack();
          },
        },
      ],
    );
  };

  const handleAddEnvVar = async () => {
    if (!newKey.trim()) return;
    try {
      const updated = [...envVars, { id: Date.now().toString(), appId, key: newKey.trim(), value: newValue }];
      await engineClient.setEnvVars(appId, updated);
      setEnvVars(updated);
      setNewKey('');
      setNewValue('');
      setShowEnvForm(false);
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to save env var');
    }
  };

  const handleDeleteEnvVar = async (varId: string) => {
    const updated = envVars.filter(v => v.id !== varId);
    try {
      await engineClient.setEnvVars(appId, updated);
      setEnvVars(updated);
    } catch {}
  };

  if (!app) {
    return (
      <View className="flex-1 bg-[#0a0a0a] items-center justify-center">
        <Text className="text-zinc-400">App not found</Text>
      </View>
    );
  }

  const isRunning = app.status === 'running';
  const isDeploying = ['cloning', 'installing', 'building', 'starting'].includes(app.status);

  // ── Action Button ──────────────────────────────────────
  const ActionButton = ({
    label,
    action,
    onPress,
    variant = 'default',
  }: {
    label: string;
    action: string;
    onPress: () => void;
    variant?: 'default' | 'danger';
  }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={actionLoading !== null || isDeploying}
      className={`flex-1 rounded-xl py-3 items-center mx-1 ${
        variant === 'danger'
          ? 'bg-red-500/15 border border-red-500/30'
          : 'bg-zinc-800 border border-zinc-700'
      } ${(actionLoading !== null || isDeploying) ? 'opacity-50' : ''}`}
    >
      {actionLoading === action ? (
        <ActivityIndicator color="#ffffff" size="small" />
      ) : (
        <Text
          className={`text-sm font-semibold ${
            variant === 'danger' ? 'text-red-400' : 'text-white'
          }`}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <View className="flex-1 bg-[#0a0a0a]">
      {/* Header */}
      <View className="flex-row items-center px-4 pt-14 pb-4 border-b border-zinc-800">
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mr-3 w-8 h-8 rounded-full bg-zinc-800 items-center justify-center"
        >
          <Text className="text-white text-lg">{"<"}</Text>
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white text-xl font-bold" numberOfLines={1}>
            {app.name}
          </Text>
          <Text className="text-zinc-500 text-xs">{app.projectType}</Text>
        </View>
        <StatusBadge status={app.status} />
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />
        }
      >
        {/* ── Tunnel URL Card ──────────────────────────── */}
        <View className="mx-4 mt-4">
          {app.tunnelUrl ? (
            <TouchableOpacity
              onPress={() => Linking.openURL(app.tunnelUrl!)}
              className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4"
            >
              <Text className="text-zinc-400 text-xs mb-1">Live URL</Text>
              <Text className="text-indigo-400 font-mono text-sm" numberOfLines={1}>
                {app.tunnelUrl}
              </Text>
              <Text className="text-zinc-500 text-xs mt-1">Tap to open in browser</Text>
            </TouchableOpacity>
          ) : isDeploying ? (
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <View className="flex-row items-center">
                <ActivityIndicator color="#6366f1" size="small" />
                <Text className="text-zinc-400 text-sm ml-2">Setting up tunnel...</Text>
              </View>
            </View>
          ) : (
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <Text className="text-zinc-500 text-sm">No tunnel URL available</Text>
            </View>
          )}
        </View>

        {/* ── Action Buttons ───────────────────────────── */}
        <View className="flex-row mx-4 mt-4">
          <ActionButton
            label="Redeploy"
            action="deploy"
            onPress={() => handleAction('deploy', () => deployApp(appId))}
          />
          <ActionButton
            label={isRunning ? 'Stop' : 'Start'}
            action="toggle"
            onPress={() =>
              handleAction('toggle', () =>
                isRunning ? stopApp(appId) : startApp(appId),
              )
            }
          />
          <ActionButton
            label="Restart"
            action="restart"
            onPress={() => handleAction('restart', () => restartApp(appId))}
          />
        </View>

        {/* ── Logs Button ──────────────────────────────── */}
        <TouchableOpacity
          onPress={() => navigation.navigate('LogViewer', { appId, appName: app.name })}
          className="mx-4 mt-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex-row items-center justify-between"
        >
          <View>
            <Text className="text-white font-semibold">View Logs</Text>
            <Text className="text-zinc-500 text-xs">Real-time application output</Text>
          </View>
          <Text className="text-zinc-500 text-lg">&gt;</Text>
        </TouchableOpacity>

        {/* ── Recent Deploys ───────────────────────────── */}
        <View className="mx-4 mt-6">
          <Text className="text-white font-semibold text-base mb-3">Recent Deploys</Text>
          {deploys.length === 0 ? (
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <Text className="text-zinc-500 text-sm">No deploys yet</Text>
            </View>
          ) : (
            deploys.map((deploy) => (
              <View
                key={deploy.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-2 flex-row items-center"
              >
                <View
                  className={`w-2 h-2 rounded-full mr-3 ${
                    deploy.status === 'success'
                      ? 'bg-green-500'
                      : deploy.status === 'failed'
                      ? 'bg-red-500'
                      : 'bg-yellow-500'
                  }`}
                />
                <View className="flex-1">
                  <Text className="text-white text-sm">
                    {deploy.trigger === 'webhook' ? 'Auto-deploy' : 'Manual deploy'}
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    {deploy.startedAt
                      ? new Date(deploy.startedAt).toLocaleString()
                      : 'Unknown'}
                  </Text>
                </View>
                <Text
                  className={`text-xs font-semibold ${
                    deploy.status === 'success'
                      ? 'text-green-400'
                      : deploy.status === 'failed'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                  }`}
                >
                  {deploy.status}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* ── Environment Variables ─────────────────────── */}
        <View className="mx-4 mt-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-white font-semibold text-base">Environment Variables</Text>
            <TouchableOpacity onPress={() => setShowEnvForm(!showEnvForm)}>
              <Text className="text-indigo-400 text-sm">
                {showEnvForm ? 'Cancel' : '+ Add'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Add form */}
          {showEnvForm && (
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-3">
              <TextInput
                className="bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm mb-2 font-mono"
                placeholder="KEY"
                placeholderTextColor="#6b7280"
                value={newKey}
                onChangeText={setNewKey}
                autoCapitalize="characters"
              />
              <TextInput
                className="bg-zinc-800 rounded-lg px-3 py-2 text-white text-sm mb-2 font-mono"
                placeholder="value"
                placeholderTextColor="#6b7280"
                value={newValue}
                onChangeText={setNewValue}
              />
              <TouchableOpacity
                onPress={handleAddEnvVar}
                className="bg-indigo-500 rounded-lg py-2 items-center"
              >
                <Text className="text-white text-sm font-semibold">Save</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Existing vars */}
          {envVars.length === 0 && !showEnvForm ? (
            <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <Text className="text-zinc-500 text-sm">No environment variables set</Text>
            </View>
          ) : (
            envVars.map((v) => (
              <View
                key={v.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 mb-2 flex-row items-center"
              >
                <View className="flex-1">
                  <Text className="text-indigo-400 font-mono text-sm">{v.key}</Text>
                  <Text className="text-zinc-500 font-mono text-xs" numberOfLines={1}>
                    {v.value.replace(/./g, '*')}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteEnvVar(v.id)}
                  className="ml-2 px-2 py-1"
                >
                  <Text className="text-red-400 text-xs">Remove</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* ── App Info ─────────────────────────────────── */}
        <View className="mx-4 mt-6 mb-4">
          <Text className="text-white font-semibold text-base mb-3">App Info</Text>
          <View className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
            {[
              ['Project Type', app.projectType],
              ['Branch', app.branch],
              ['Port', app.port?.toString() || '-'],
              ['Created', app.createdAt ? new Date(app.createdAt).toLocaleDateString() : '-'],
              ['Last Deploy', app.lastDeploy ? new Date(app.lastDeploy).toLocaleString() : 'Never'],
            ].map(([label, value]) => (
              <View key={label} className="flex-row justify-between py-2 border-b border-zinc-800 last:border-b-0">
                <Text className="text-zinc-400 text-sm">{label}</Text>
                <Text className="text-white text-sm">{value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Danger Zone ──────────────────────────────── */}
        <View className="mx-4 mt-2 mb-8">
          <TouchableOpacity
            onPress={handleDelete}
            className="bg-red-500/10 border border-red-500/30 rounded-xl py-4 items-center"
          >
            <Text className="text-red-400 font-semibold">Delete App</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}