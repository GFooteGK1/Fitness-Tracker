/**
 * Session Synchronization Service
 *
 * Keeps authentication state consistent across browser tabs using
 * BroadcastChannel API with localStorage event fallback.
 *
 * Requirements: 5.1, 5.2, 5.3
 */

export type SessionEvent = 'login' | 'logout' | 'token_refresh';

export interface SessionSyncMessage {
  type: SessionEvent;
  timestamp: number;
}

type SessionChangeCallback = (event: SessionEvent) => void;

export class SessionSyncService {
  private channel: BroadcastChannel | null = null;
  private listeners: SessionChangeCallback[] = [];
  private useLocalStorageFallback = false;
  private storageHandler: ((event: StorageEvent) => void) | null = null;
  private initialized = false;

  private static readonly CHANNEL_NAME = 'sociusfit-session-sync';
  private static readonly STORAGE_KEY = 'sociusfit-session-event';

  initialize(): void {
    if (this.initialized) return;
    if (typeof window === 'undefined') return;

    try {
      this.channel = new BroadcastChannel(SessionSyncService.CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<SessionSyncMessage>) => {
        this.notifyListeners(event.data.type);
      };
    } catch {
      // BroadcastChannel not supported — fall back to localStorage events
      this.useLocalStorageFallback = true;
      this.storageHandler = (event: StorageEvent) => {
        if (event.key !== SessionSyncService.STORAGE_KEY || !event.newValue) return;
        try {
          const message: SessionSyncMessage = JSON.parse(event.newValue);
          this.notifyListeners(message.type);
        } catch {
          // Ignore malformed events
        }
      };
      window.addEventListener('storage', this.storageHandler);
    }

    this.initialized = true;
  }

  broadcastSessionChange(event: SessionEvent): void {
    const message: SessionSyncMessage = {
      type: event,
      timestamp: Date.now(),
    };

    if (this.channel && !this.useLocalStorageFallback) {
      this.channel.postMessage(message);
    } else if (this.useLocalStorageFallback && typeof localStorage !== 'undefined') {
      // Write then immediately remove so the storage event fires in other tabs
      localStorage.setItem(SessionSyncService.STORAGE_KEY, JSON.stringify(message));
      localStorage.removeItem(SessionSyncService.STORAGE_KEY);
    }
  }

  onSessionChange(callback: SessionChangeCallback): void {
    this.listeners.push(callback);
  }

  removeListener(callback: SessionChangeCallback): void {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  cleanup(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    if (this.storageHandler) {
      window.removeEventListener('storage', this.storageHandler);
      this.storageHandler = null;
    }

    this.listeners = [];
    this.initialized = false;
    this.useLocalStorageFallback = false;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  isUsingFallback(): boolean {
    return this.useLocalStorageFallback;
  }

  private notifyListeners(event: SessionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[SessionSyncService] Listener error:', err);
      }
    }
  }
}

export const sessionSyncService = new SessionSyncService();
