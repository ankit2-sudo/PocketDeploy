import { create } from 'zustand';
import { App, AppStatus, LogLine, mapDbAppToApp } from '../types';
import { engineClient } from '../engine/EngineClient';
import { wsClient } from '../engine/WebSocketClient';

interface AppStore {
  // State
  apps: App[];
  activeLogs: Record<string, LogLine[]>;
  engineConnected: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  init: () => void;
  cleanup: () => void;
  fetchApps: () => Promise<void>;
  addApp: (repoUrl: string, name: string, branch: string) => Promise<App>;
  removeApp: (id: string) => Promise<void>;
  deployApp: (id: string) => Promise<void>;
  stopApp: (id: string) => Promise<void>;
  startApp: (id: string) => Promise<void>;
  restartApp: (id: string) => Promise<void>;
  updateAppStatus: (id: string, status: AppStatus) => void;
  updateTunnelUrl: (id: string, url: string) => void;
  appendLog: (appId: string, line: LogLine) => void;
  clearLogs: (appId: string) => void;
  setEngineConnected: (connected: boolean) => void;
  setError: (error: string | null) => void;
}

const MAX_LOG_LINES = 500;

export const useAppStore = create<AppStore>((set, get) => {
  let unsubscribers: (() => void)[] = [];

  return {
    apps: [],
    activeLogs: {},
    engineConnected: false,
    isLoading: false,
    error: null,

    init: () => {
      wsClient.connect();

      const unsub1 = wsClient.onConnectionChange((connected) => {
        get().setEngineConnected(connected);
        if (connected) {
          get().fetchApps();
        }
      });

      const unsub2 = wsClient.onStatusChange((appId, status) => {
        get().updateAppStatus(appId, status);
      });

      const unsub3 = wsClient.onTunnelReady((appId, url) => {
        get().updateTunnelUrl(appId, url);
      });

      const unsub4 = wsClient.onLog((appId, line) => {
        get().appendLog(appId, line);
      });

      const unsub5 = wsClient.onDeployComplete((appId, success, error) => {
        get().fetchApps();
        if (!success && error) {
          get().appendLog(appId, {
            timestamp: new Date().toISOString(),
            message: `Deploy failed: ${error}`,
            type: 'stderr',
          });
        }
      });

      unsubscribers = [unsub1, unsub2, unsub3, unsub4, unsub5];
    },

    cleanup: () => {
      unsubscribers.forEach((unsub) => unsub());
      unsubscribers = [];
      wsClient.disconnect();
    },

    fetchApps: async () => {
      try {
        set({ isLoading: true, error: null });
        const rawApps = await engineClient.getApps();
        const apps = rawApps.map(mapDbAppToApp);
        set({ apps, isLoading: false });
      } catch (err) {
        set({ isLoading: false, error: (err as Error).message });
      }
    },

    addApp: async (repoUrl, name, branch) => {
      try {
        set({ error: null });
        const rawApp = await engineClient.createApp(repoUrl, name, branch);
        const app = mapDbAppToApp(rawApp);
        set((s) => ({ apps: [app, ...s.apps] }));
        return app;
      } catch (err) {
        set({ error: (err as Error).message });
        throw err;
      }
    },

    removeApp: async (id) => {
      try {
        set({ error: null });
        await engineClient.deleteApp(id);
        set((s) => ({
          apps: s.apps.filter((a) => a.id !== id),
          activeLogs: (() => {
            const logs = { ...s.activeLogs };
            delete logs[id];
            return logs;
          })(),
        }));
      } catch (err) {
        set({ error: (err as Error).message });
        throw err;
      }
    },

    deployApp: async (id) => {
      try {
        set({ error: null });
        await engineClient.deployApp(id);
      } catch (err) {
        set({ error: (err as Error).message });
        throw err;
      }
    },

    stopApp: async (id) => {
      try {
        set({ error: null });
        await engineClient.stopApp(id);
        get().updateAppStatus(id, 'stopped');
      } catch (err) {
        set({ error: (err as Error).message });
        throw err;
      }
    },

    startApp: async (id) => {
      try {
        set({ error: null });
        await engineClient.startApp(id);
      } catch (err) {
        set({ error: (err as Error).message });
        throw err;
      }
    },

    restartApp: async (id) => {
      try {
        set({ error: null });
        await engineClient.restartApp(id);
      } catch (err) {
        set({ error: (err as Error).message });
        throw err;
      }
    },

    updateAppStatus: (id, status) =>
      set((s) => ({
        apps: s.apps.map((a) => (a.id === id ? { ...a, status } : a)),
      })),

    updateTunnelUrl: (id, url) =>
      set((s) => ({
        apps: s.apps.map((a) => (a.id === id ? { ...a, tunnelUrl: url } : a)),
      })),

    appendLog: (appId, line) =>
      set((s) => ({
        activeLogs: {
          ...s.activeLogs,
          [appId]: [...(s.activeLogs[appId] || []).slice(-(MAX_LOG_LINES - 1)), line],
        },
      })),

    clearLogs: (appId) =>
      set((s) => ({
        activeLogs: { ...s.activeLogs, [appId]: [] },
      })),

    setEngineConnected: (connected) => set({ engineConnected: connected }),

    setError: (error) => set({ error }),
  };
});
