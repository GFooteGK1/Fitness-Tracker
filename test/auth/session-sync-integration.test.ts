/**
 * Integration Tests for Cross-Tab Session Synchronization
 *
 * Task 12.1: Test BroadcastChannel API integration and localStorage event fallback.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SessionSyncService,
  type SessionEvent,
} from '@/app/lib/auth/session-sync-service';

// Mock BroadcastChannel for integration testing
class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = [];
  name: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  closed = false;

  constructor(name: string) {
    this.name = name;
    MockBroadcastChannel.instances.push(this);
  }

  postMessage(data: any): void {
    if (this.closed) return;
    MockBroadcastChannel.instances
      .filter(ch => ch !== this && ch.name === this.name && !ch.closed)
      .forEach(ch => {
        if (ch.onmessage) {
          ch.onmessage(new MessageEvent('message', { data }));
        }
      });
  }

  close(): void {
    this.closed = true;
    MockBroadcastChannel.instances = MockBroadcastChannel.instances.filter(ch => ch !== this);
  }

  static reset(): void {
    MockBroadcastChannel.instances = [];
  }
}

describe('Cross-Tab Session Synchronization - Integration', () => {
  let originalBroadcastChannel: any;
  let originalWindow: any;

  beforeEach(() => {
    MockBroadcastChannel.reset();
    originalBroadcastChannel = (global as any).BroadcastChannel;
    originalWindow = (global as any).window;
    (global as any).BroadcastChannel = MockBroadcastChannel;
    (global as any).window = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
  });

  afterEach(() => {
    (global as any).BroadcastChannel = originalBroadcastChannel;
    (global as any).window = originalWindow;
  });

  describe('BroadcastChannel API', () => {
    it('should deliver login events between tabs', () => {
      const tab1 = new SessionSyncService();
      const tab2 = new SessionSyncService();
      tab1.initialize();
      tab2.initialize();

      const received: SessionEvent[] = [];
      tab1.onSessionChange(evt => received.push(evt));

      tab2.broadcastSessionChange('login');

      expect(received).toEqual(['login']);

      tab1.cleanup();
      tab2.cleanup();
    });

    it('should deliver logout events between tabs', () => {
      const tab1 = new SessionSyncService();
      const tab2 = new SessionSyncService();
      tab1.initialize();
      tab2.initialize();

      const received: SessionEvent[] = [];
      tab1.onSessionChange(evt => received.push(evt));

      tab2.broadcastSessionChange('logout');

      expect(received).toEqual(['logout']);

      tab1.cleanup();
      tab2.cleanup();
    });

    it('should deliver token_refresh events between tabs', () => {
      const tab1 = new SessionSyncService();
      const tab2 = new SessionSyncService();
      tab1.initialize();
      tab2.initialize();

      const received: SessionEvent[] = [];
      tab1.onSessionChange(evt => received.push(evt));

      tab2.broadcastSessionChange('token_refresh');

      expect(received).toEqual(['token_refresh']);

      tab1.cleanup();
      tab2.cleanup();
    });

    it('should support three tabs communicating', () => {
      const tab1 = new SessionSyncService();
      const tab2 = new SessionSyncService();
      const tab3 = new SessionSyncService();
      tab1.initialize();
      tab2.initialize();
      tab3.initialize();

      const received1: SessionEvent[] = [];
      const received2: SessionEvent[] = [];
      const received3: SessionEvent[] = [];
      tab1.onSessionChange(evt => received1.push(evt));
      tab2.onSessionChange(evt => received2.push(evt));
      tab3.onSessionChange(evt => received3.push(evt));

      // Tab 1 broadcasts logout
      tab1.broadcastSessionChange('logout');

      // Tab 1 doesn't receive its own event, tabs 2 and 3 do
      expect(received1).toHaveLength(0);
      expect(received2).toEqual(['logout']);
      expect(received3).toEqual(['logout']);

      tab1.cleanup();
      tab2.cleanup();
      tab3.cleanup();
    });

    it('should not deliver events after cleanup', () => {
      const tab1 = new SessionSyncService();
      const tab2 = new SessionSyncService();
      tab1.initialize();
      tab2.initialize();

      const received: SessionEvent[] = [];
      tab1.onSessionChange(evt => received.push(evt));

      tab1.cleanup();
      tab2.broadcastSessionChange('logout');

      expect(received).toHaveLength(0);

      tab2.cleanup();
    });

    it('should not deliver events to removed listeners', () => {
      const tab1 = new SessionSyncService();
      const tab2 = new SessionSyncService();
      tab1.initialize();
      tab2.initialize();

      const received: SessionEvent[] = [];
      const listener = (evt: SessionEvent) => received.push(evt);
      tab1.onSessionChange(listener);
      tab1.removeListener(listener);

      tab2.broadcastSessionChange('logout');

      expect(received).toHaveLength(0);

      tab1.cleanup();
      tab2.cleanup();
    });

    it('should handle double initialization gracefully', () => {
      const service = new SessionSyncService();
      service.initialize();
      service.initialize(); // Should be a no-op

      expect(service.isInitialized()).toBe(true);

      service.cleanup();
    });
  });

  describe('localStorage Event Fallback', () => {
    let storageHandlers: ((event: any) => void)[];
    let originalLocalStorage: any;

    beforeEach(() => {
      storageHandlers = [];
      originalLocalStorage = (global as any).localStorage;
      // Remove BroadcastChannel to force fallback
      delete (global as any).BroadcastChannel;

      (global as any).window = {
        addEventListener: vi.fn((_type: string, handler: any) => {
          storageHandlers.push(handler);
        }),
        removeEventListener: vi.fn((_type: string, handler: any) => {
          storageHandlers = storageHandlers.filter(h => h !== handler);
        }),
      };

      const store = new Map<string, string>();
      (global as any).localStorage = {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      };
    });

    afterEach(() => {
      (global as any).localStorage = originalLocalStorage;
    });

    it('should use localStorage fallback when BroadcastChannel is unavailable', () => {
      const service = new SessionSyncService();
      service.initialize();

      expect(service.isUsingFallback()).toBe(true);
      expect(service.isInitialized()).toBe(true);

      service.cleanup();
    });

    it('should register storage event listener', () => {
      const service = new SessionSyncService();
      service.initialize();

      expect(window.addEventListener).toHaveBeenCalledWith('storage', expect.any(Function));

      service.cleanup();
    });

    it('should clean up storage event listener', () => {
      const service = new SessionSyncService();
      service.initialize();
      service.cleanup();

      expect(window.removeEventListener).toHaveBeenCalledWith('storage', expect.any(Function));
    });

    it('should deliver events via storage events', () => {
      const service = new SessionSyncService();
      service.initialize();

      const received: SessionEvent[] = [];
      service.onSessionChange(evt => received.push(evt));

      // Simulate storage event from another tab (use plain object since StorageEvent is not available in Node)
      const message = { type: 'logout', timestamp: Date.now() };
      const storageEvent = {
        key: 'sociusfit-session-event',
        newValue: JSON.stringify(message),
      };
      storageHandlers.forEach(h => h(storageEvent));

      expect(received).toEqual(['logout']);

      service.cleanup();
    });

    it('should ignore storage events with wrong key', () => {
      const service = new SessionSyncService();
      service.initialize();

      const received: SessionEvent[] = [];
      service.onSessionChange(evt => received.push(evt));

      const storageEvent = {
        key: 'other-key',
        newValue: JSON.stringify({ type: 'logout', timestamp: Date.now() }),
      };
      storageHandlers.forEach(h => h(storageEvent));

      expect(received).toHaveLength(0);

      service.cleanup();
    });

    it('should ignore malformed storage events', () => {
      const service = new SessionSyncService();
      service.initialize();

      const received: SessionEvent[] = [];
      service.onSessionChange(evt => received.push(evt));

      const storageEvent = {
        key: 'sociusfit-session-event',
        newValue: 'not-json',
      };
      storageHandlers.forEach(h => h(storageEvent));

      expect(received).toHaveLength(0);

      service.cleanup();
    });
  });
});
