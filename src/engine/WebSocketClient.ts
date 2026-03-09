import { AppStatus, LogLine } from '../types';

type LogCallback = (appId: string, line: LogLine) => void;
type StatusCallback = (appId: string, status: AppStatus) => void;
type DeployDoneCallback = (appId: string, success: boolean, error?: string) => void;
type TunnelReadyCallback = (appId: string, url: string) => void;
type ConnectionCallback = (connected: boolean) => void;

const WS_URL = 'ws://localhost:4001';

class WebSocketClient {
  private ws: WebSocket | null = null;
  private retryDelay = 1000;
  private maxRetryDelay = 30000;
  private shouldReconnect = true;

  private callbacks = {
    log: [] as LogCallback[],
    statusChange: [] as StatusCallback[],
    deployComplete: [] as DeployDoneCallback[],
    tunnelReady: [] as TunnelReadyCallback[],
    connection: [] as ConnectionCallback[],
  };

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.shouldReconnect = true;

    try {
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        console.log('[WS] Connected');
        this.retryDelay = 1000;
        this.callbacks.connection.forEach((cb) => cb(true));
      };

      this.ws.onclose = () => {
        console.log('[WS] Disconnected');
        this.callbacks.connection.forEach((cb) => cb(false));
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error) => {
        console.log('[WS] Error:', error);
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);

          switch (msg.event) {
            case 'log':
              this.callbacks.log.forEach((cb) => cb(msg.appId, msg.line));
              break;
            case 'status_change':
              this.callbacks.statusChange.forEach((cb) => cb(msg.appId, msg.status as AppStatus));
              break;
            case 'deploy_complete':
              this.callbacks.deployComplete.forEach((cb) => cb(msg.appId, msg.success, msg.error));
              break;
            case 'tunnel_ready':
              this.callbacks.tunnelReady.forEach((cb) => cb(msg.appId, msg.url));
              break;
          }
        } catch (err) {
          console.warn('[WS] Failed to parse message:', err);
        }
      };
    } catch (err) {
      console.error('[WS] Failed to connect:', err);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private scheduleReconnect(): void {
    setTimeout(() => {
      if (this.shouldReconnect) {
        console.log(`[WS] Reconnecting in ${this.retryDelay}ms...`);
        this.connect();
      }
    }, this.retryDelay);

    // Exponential backoff with max
    this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // -- Event Listeners

  onLog(cb: LogCallback): () => void {
    this.callbacks.log.push(cb);
    return () => { this.callbacks.log = this.callbacks.log.filter((c) => c !== cb); };
  }

  onStatusChange(cb: StatusCallback): () => void {
    this.callbacks.statusChange.push(cb);
    return () => { this.callbacks.statusChange = this.callbacks.statusChange.filter((c) => c !== cb); };
  }

  onDeployComplete(cb: DeployDoneCallback): () => void {
    this.callbacks.deployComplete.push(cb);
    return () => { this.callbacks.deployComplete = this.callbacks.deployComplete.filter((c) => c !== cb); };
  }

  onTunnelReady(cb: TunnelReadyCallback): () => void {
    this.callbacks.tunnelReady.push(cb);
    return () => { this.callbacks.tunnelReady = this.callbacks.tunnelReady.filter((c) => c !== cb); };
  }

  onConnectionChange(cb: ConnectionCallback): () => void {
    this.callbacks.connection.push(cb);
    return () => { this.callbacks.connection = this.callbacks.connection.filter((c) => c !== cb); };
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export const wsClient = new WebSocketClient();
