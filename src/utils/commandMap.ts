import { ProjectType } from '../types';

interface ProjectInfo {
  label: string;
  icon: string;
  color: string;
  language: string;
}

export const PROJECT_INFO: Record<ProjectType, ProjectInfo> = {
  nextjs:   { label: 'Next.js',          icon: 'language-javascript', color: '#000000', language: 'JavaScript' },
  cra:      { label: 'Create React App', icon: 'react',               color: '#61DAFB', language: 'JavaScript' },
  vite:     { label: 'Vite',             icon: 'flash',               color: '#646CFF', language: 'JavaScript' },
  express:  { label: 'Express',          icon: 'server',              color: '#000000', language: 'JavaScript' },
  fastify:  { label: 'Fastify',          icon: 'server',              color: '#000000', language: 'JavaScript' },
  koa:      { label: 'Koa',              icon: 'server',              color: '#33333D', language: 'JavaScript' },
  nestjs:   { label: 'NestJS',           icon: 'server',              color: '#E0234E', language: 'TypeScript' },
  remix:    { label: 'Remix',            icon: 'web',                 color: '#000000', language: 'TypeScript' },
  node:     { label: 'Node.js',          icon: 'nodejs',              color: '#339933', language: 'JavaScript' },
  django:   { label: 'Django',           icon: 'language-python',     color: '#092E20', language: 'Python' },
  flask:    { label: 'Flask',            icon: 'language-python',     color: '#000000', language: 'Python' },
  fastapi:  { label: 'FastAPI',          icon: 'language-python',     color: '#009688', language: 'Python' },
  python:   { label: 'Python',           icon: 'language-python',     color: '#3776AB', language: 'Python' },
  go:       { label: 'Go',               icon: 'language-go',         color: '#00ADD8', language: 'Go' },
  rust:     { label: 'Rust',             icon: 'cog',                 color: '#000000', language: 'Rust' },
  php:      { label: 'PHP',              icon: 'language-php',        color: '#777BB4', language: 'PHP' },
  rails:    { label: 'Ruby on Rails',    icon: 'diamond-stone',       color: '#CC0000', language: 'Ruby' },
  ruby:     { label: 'Ruby',             icon: 'diamond-stone',       color: '#CC342D', language: 'Ruby' },
  unknown:  { label: 'Unknown',          icon: 'help-circle',         color: '#6B7280', language: 'Unknown' },
};

export function getProjectInfo(type: ProjectType | null): ProjectInfo {
  return PROJECT_INFO[type || 'unknown'] || PROJECT_INFO['unknown'];
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    idle: '#6B7280',
    cloning: '#EAB308',
    installing: '#EAB308',
    building: '#EAB308',
    starting: '#EAB308',
    running: '#22C55E',
    stopped: '#6B7280',
    crashed: '#EF4444',
    error: '#EF4444',
  };
  return colors[status] || '#6B7280';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    idle: 'Idle',
    cloning: 'Cloning...',
    installing: 'Installing...',
    building: 'Building...',
    starting: 'Starting...',
    running: 'Running',
    stopped: 'Stopped',
    crashed: 'Crashed',
    error: 'Error',
  };
  return labels[status] || 'Unknown';
}

export function isActiveStatus(status: string): boolean {
  return ['cloning', 'installing', 'building', 'starting'].includes(status);
}
