import axios, { AxiosInstance } from 'axios';
import { App, Deploy, LogLine, EnvVar } from '../types';

const BASE_URL = 'http://localhost:4000';

class EngineClient {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: BASE_URL,
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Health ──────────────────────────────────────────────────────

  async checkHealth(): Promise<{ status: string; appsRunning: number; totalApps: number }> {
    try {
      const { data } = await this.api.get('/health');
      return data;
    } catch {
      throw new Error('Engine not responding');
    }
  }

  async waitForEngine(maxWaitMs: number = 10000, intervalMs: number = 500): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      try {
        await this.checkHealth();
        return true;
      } catch {
        await new Promise((r) => setTimeout(r, intervalMs));
      }
    }
    return false;
  }

  // ── Apps ─────────────────────────────────────────────────────

  async createApp(repoUrl: string, name: string, branch: string = 'main'): Promise<App> {
    const { data } = await this.api.post('/apps', { repoUrl, name, branch });
    return data;
  }

  async getApps(): Promise<App[]> {
    const { data } = await this.api.get('/apps');
    return data;
  }

  async getApp(id: string): Promise<App> {
    const { data } = await this.api.get(`/apps/${id}`);
    return data;
  }

  async deleteApp(id: string): Promise<void> {
    await this.api.delete(`/apps/${id}`);
  }

  // ── Deploy Controls ──────────────────────────────────────────

  async deployApp(id: string): Promise<void> {
    await this.api.post(`/apps/${id}/deploy`);
  }

  async stopApp(id: string): Promise<void> {
    await this.api.post(`/apps/${id}/stop`);
  }

  async startApp(id: string): Promise<void> {
    await this.api.post(`/apps/${id}/start`);
  }

  async restartApp(id: string): Promise<void> {
    await this.api.post(`/apps/${id}/restart`);
  }

  // ── Logs & Deploys ─────────────────────────────────────────

  async getLogs(id: string): Promise<LogLine[]> {
    const { data } = await this.api.get(`/apps/${id}/logs`);
    return data;
  }

  async getDeploys(id: string): Promise<Deploy[]> {
    const { data } = await this.api.get(`/apps/${id}/deploys`);
    return data;
  }

  // ── Environment Variables ──────────────────────────────────

  async setEnvVars(id: string, vars: { key: string; value: string }[]): Promise<void> {
    await this.api.post(`/apps/${id}/env`, { vars });
  }

  // ── Tunnel ──────────────────────────────────────────────────

  async getTunnelUrl(id: string): Promise<string | null> {
    const { data } = await this.api.get(`/apps/${id}/tunnel`);
    return data.url || null;
  }

  // ── Repo Scanning ──────────────────────────────────────────

  async scanRepo(repoUrl: string, branch: string = 'main'): Promise<{
    projectType: string;
    language: string;
    installCommand: string | null;
    buildCommand: string | null;
    startCommand: string;
    confidence: 'high' | 'medium' | 'low';
    envVarsDetected: boolean;
  }> {
    const { data } = await this.api.post('/scan', { repoUrl, branch });
    return data;
  }

  // ── Settings / Global Controls ─────────────────────────────

  async setGitHubToken(token: string): Promise<void> {
    await this.api.post('/settings/github-token', { token });
  }

  async stopAllApps(): Promise<void> {
    await this.api.post('/apps/stop-all');
  }

  async restartEngine(): Promise<void> {
    await this.api.post('/engine/restart');
  }
}

export const engineClient = new EngineClient();
