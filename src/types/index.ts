export type AppStatus =
  | 'idle'
  | 'cloning'
  | 'installing'
  | 'building'
  | 'starting'
  | 'running'
  | 'stopped'
  | 'crashed'
  | 'error';

export type ProjectType =
  | 'nextjs'
  | 'cra'
  | 'vite'
  | 'express'
  | 'fastify'
  | 'koa'
  | 'nestjs'
  | 'remix'
  | 'node'
  | 'django'
  | 'flask'
  | 'fastapi'
  | 'python'
  | 'go'
  | 'rust'
  | 'php'
  | 'rails'
  | 'ruby'
  | 'unknown';

export interface DetectedConfig {
  projectType: ProjectType;
  language: string;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string;
  confidence: 'high' | 'medium' | 'low';
  envVarsDetected: boolean;
}

export interface App {
  id: string;
  name: string;
  repoUrl: string;
  branch: string;
  projectType: ProjectType | null;
  installCommand: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  port: number;
  tunnelUrl: string | null;
  webhookSecret: string | null;
  status: AppStatus;
  createdAt: string;
  lastDeploy: string | null;
}

export interface Deploy {
  id: string;
  appId: string;
  trigger: 'manual' | 'webhook' | 'startup';
  status: 'running' | 'success' | 'failed';
  log: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface EnvVar {
  id: string;
  appId: string;
  key: string;
  value: string;
}

export interface LogLine {
  timestamp: string;
  message: string;
  type: 'stdout' | 'stderr' | 'system';
}

export interface SetupStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

export interface BinaryStatus {
  node: boolean;
  git: boolean;
  python: boolean;
  cloudflared: boolean;
  pm2: boolean;
}

// Helper to map DB snake_case to camelCase
export function mapDbAppToApp(dbApp: any): App {
  return {
    id: dbApp.id,
    name: dbApp.name,
    repoUrl: dbApp.repo_url,
    branch: dbApp.branch,
    projectType: dbApp.project_type as ProjectType | null,
    installCommand: dbApp.install_cmd,
    buildCommand: dbApp.build_cmd,
    startCommand: dbApp.start_cmd,
    port: dbApp.port,
    tunnelUrl: dbApp.tunnel_url,
    webhookSecret: dbApp.webhook_secret,
    status: dbApp.status as AppStatus,
    createdAt: dbApp.created_at,
    lastDeploy: dbApp.last_deploy,
  };
}

export function mapDbDeployToDeploy(dbDeploy: any): Deploy {
  return {
    id: dbDeploy.id,
    appId: dbDeploy.app_id,
    trigger: dbDeploy.trigger,
    status: dbDeploy.status,
    log: dbDeploy.log,
    startedAt: dbDeploy.started_at,
    finishedAt: dbDeploy.finished_at,
  };
}
