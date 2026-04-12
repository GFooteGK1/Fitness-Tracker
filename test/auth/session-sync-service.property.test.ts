/**
 * Property-Based Tests for Session Synchronization Service
 *
 * Property 10: Session State Propagation
 * Validates: Requirements 5.1
 *
 * Property 11: Proactive Session Expiry Handling
 * Validates: Requirements 5.2
 *
 * Property 12: Token Refresh Side Effects
 * Validates: Requirements 5.3
 */

import { describe, expect, beforeEach, afterEach, vi } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  SessionSyncService,
  type SessionEvent,
  type SessionSyncMessage,
} from '@/app/lib/auth/session-sync-service';

// Mock BroadcastChannel
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
    // Deliver to all other instances on the same channel
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

describe('Session Sync Service - Property Tests', () => {
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

  /**
   * Property 10: Session State Propagation
   */
  test.prop([
    fc.constantFrom<SessionEvent>('login', 'logout', 'token_refresh')
  ])('Property 10: session changes propagate to all listeners', (eventType) => {
    const service = new SessionSyncService();
    service.initialize();

    const received: SessionEvent[] = [];
    service.onSessionChange(evt => received.push(evt));

    // Create a second service (simulating another tab)
    const otherTab = new SessionSyncService();
    otherTab.initialize();
    otherTab.broadcastSessionChange(eventType);

    // Property: listener receives the event
    expect(received).toHaveLength(1);
    expect(received[0]).toBe(eventType);

    service.cleanup();
    otherTab.cleanup();
  });

  test.prop([
    fc.array(
      fc.constantFrom<SessionEvent>('login', 'logout', 'token_refresh'),
      { minLength: 1, maxLength: 10 }
    )
  ])('Property 10: all broadcasted events are received in order', (events) => {
    const service = new SessionSyncService();
    service.initialize();

    const received: SessionEvent[] = [];
    service.onSessionChange(evt => received.push(evt));

    const sender = new SessionSyncService();
    sender.initialize();

    events.forEach(evt => sender.broadcastSessionChange(evt));

    // Property: all events received in order
    expect(received).toEqual(events);

    service.cleanup();
    sender.cleanup();
  });

  test.prop([
    fc.integer({ min: 1, max: 5 }),
    fc.constantFrom<SessionEvent>('login', 'logout', 'token_refresh')
  ])('Property 10: multiple listeners all receive events', (listenerCount, eventType) => {
    const service = new SessionSyncService();
    service.initialize();

    const results: boolean[] = [];
    for (let i = 0; i < listenerCount; i++) {
      service.onSessionChange(evt => {
        results.push(evt === eventType);
      });
    }

    const sender = new SessionSyncService();
    sender.initialize();
    sender.broadcastSessionChange(eventType);

    // Property: every listener was called
    expect(results).toHaveLength(listenerCount);
    expect(results.every(Boolean)).toBe(true);

    service.cleanup();
    sender.cleanup();
  });

  /**
   * Property 11: Proactive Session Expiry Handling
   */
  test.prop([
    fc.constantFrom<SessionEvent>('logout')
  ])('Property 11: logout events reach listeners for expiry handling', (eventType) => {
    const service = new SessionSyncService();
    service.initialize();

    let expiryHandled = false;
    service.onSessionChange(evt => {
      if (evt === 'logout') {
        expiryHandled = true;
      }
    });

    const sender = new SessionSyncService();
    sender.initialize();
    sender.broadcastSessionChange(eventType);

    // Property: session expiry event is handled
    expect(expiryHandled).toBe(true);

    service.cleanup();
    sender.cleanup();
  });

  test.prop([
    fc.array(
      fc.constantFrom<SessionEvent>('login', 'logout', 'token_refresh'),
      { minLength: 1, maxLength: 20 }
    )
  ])('Property 11: logout always triggers handler regardless of event sequence', (events) => {
    const service = new SessionSyncService();
    service.initialize();

    let logoutCount = 0;
    service.onSessionChange(evt => {
      if (evt === 'logout') logoutCount++;
    });

    const sender = new SessionSyncService();
    sender.initialize();

    events.forEach(evt => sender.broadcastSessionChange(evt));

    const expectedLogouts = events.filter(e => e === 'logout').length;
    expect(logoutCount).toBe(expectedLogouts);

    service.cleanup();
    sender.cleanup();
  });

  /**
   * Property 12: Token Refresh Side Effects
   */
  test.prop([
    fc.constantFrom<SessionEvent>('token_refresh')
  ])('Property 12: token refresh events notify all components', (eventType) => {
    const service = new SessionSyncService();
    service.initialize();

    const componentUpdates: string[] = [];

    // Simulate multiple components registering
    service.onSessionChange(evt => {
      if (evt === 'token_refresh') componentUpdates.push('component_a');
    });
    service.onSessionChange(evt => {
      if (evt === 'token_refresh') componentUpdates.push('component_b');
    });

    const sender = new SessionSyncService();
    sender.initialize();
    sender.broadcastSessionChange(eventType);

    // Property: all components are notified
    expect(componentUpdates).toContain('component_a');
    expect(componentUpdates).toContain('component_b');

    service.cleanup();
    sender.cleanup();
  });

  test.prop([
    fc.integer({ min: 1, max: 5 })
  ])('Property 12: multiple token refreshes each notify all listeners', (refreshCount) => {
    const service = new SessionSyncService();
    service.initialize();

    let count = 0;
    service.onSessionChange(evt => {
      if (evt === 'token_refresh') count++;
    });

    const sender = new SessionSyncService();
    sender.initialize();

    for (let i = 0; i < refreshCount; i++) {
      sender.broadcastSessionChange('token_refresh');
    }

    expect(count).toBe(refreshCount);

    service.cleanup();
    sender.cleanup();
  });

  // Service lifecycle tests
  test.prop([
    fc.constantFrom<SessionEvent>('login', 'logout', 'token_refresh')
  ])('cleanup prevents further event delivery', (eventType) => {
    const service = new SessionSyncService();
    service.initialize();

    const received: SessionEvent[] = [];
    service.onSessionChange(evt => received.push(evt));
    service.cleanup();

    // After cleanup, the channel is closed and listeners cleared
    expect(service.isInitialized()).toBe(false);

    // No events should arrive
    const sender = new SessionSyncService();
    sender.initialize();
    sender.broadcastSessionChange(eventType);

    expect(received).toHaveLength(0);

    sender.cleanup();
  });

  test.prop([
    fc.constantFrom<SessionEvent>('login', 'logout', 'token_refresh')
  ])('removeListener stops delivery to that listener only', (eventType) => {
    const service = new SessionSyncService();
    service.initialize();

    const received1: SessionEvent[] = [];
    const received2: SessionEvent[] = [];

    const listener1 = (evt: SessionEvent) => received1.push(evt);
    const listener2 = (evt: SessionEvent) => received2.push(evt);

    service.onSessionChange(listener1);
    service.onSessionChange(listener2);
    service.removeListener(listener1);

    const sender = new SessionSyncService();
    sender.initialize();
    sender.broadcastSessionChange(eventType);

    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(1);

    service.cleanup();
    sender.cleanup();
  });
});

describe('Session Sync Service - localStorage Fallback', () => {
  let originalBroadcastChannel: any;
  let originalWindow: any;
  let originalLocalStorage: any;
  let storageHandlers: ((event: any) => void)[];

  beforeEach(() => {
    storageHandlers = [];
    originalBroadcastChannel = (global as any).BroadcastChannel;
    originalWindow = (global as any).window;
    originalLocalStorage = (global as any).localStorage;

    // Remove BroadcastChannel to force fallback
    delete (global as any).BroadcastChannel;

    // Mock window with addEventListener for storage events
    (global as any).window = {
      addEventListener: vi.fn((_type: string, handler: any) => {
        storageHandlers.push(handler);
      }),
      removeEventListener: vi.fn((_type: string, handler: any) => {
        storageHandlers = storageHandlers.filter(h => h !== handler);
      }),
    };

    // Mock localStorage
    const store = new Map<string, string>();
    (global as any).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
  });

  afterEach(() => {
    (global as any).BroadcastChannel = originalBroadcastChannel;
    (global as any).window = originalWindow;
    (global as any).localStorage = originalLocalStorage;
  });

  test.prop([
    fc.constantFrom<SessionEvent>('login', 'logout', 'token_refresh')
  ])('falls back to localStorage events when BroadcastChannel unavailable', (eventType) => {
    const service = new SessionSyncService();
    service.initialize();

    expect(service.isUsingFallback()).toBe(true);
    expect(service.isInitialized()).toBe(true);

    service.cleanup();
  });
});
