/**
 * Port registry utilities for the mobile app.
 * The actual port assignment happens server-side in the engine,
 * but this provides display helpers and constants.
 */

export const PORT_RANGE_START = 3001;
export const PORT_RANGE_END = 3010;
export const MAX_APPS = 10;

export function getPortDisplay(port: number): string {
  return `:${port}`;
}

export function getLocalUrl(port: number): string {
  return `http://localhost:${port}`;
}

export function isValidPort(port: number): boolean {
  return port >= PORT_RANGE_START && port <= PORT_RANGE_END;
}

export function getAvailableSlots(usedPorts: number[]): number {
  return MAX_APPS - usedPorts.length;
}
