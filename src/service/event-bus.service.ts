import {EventEmitter} from 'node:events';
import {Service} from '../config/stereotypes.js';
import type {AppEvent} from '../model/app-event.js';

type Listener = (event: AppEvent) => void;

/**
 * In-process publish/subscribe.
 * shortcut: one process only; with several instances, SSE and WebSocket
 * clients see only their instance's events. Back it with Redis pub/sub when
 * you scale out.
 */
@Service()
export class EventBus {
  private readonly emitter = new EventEmitter().setMaxListeners(0);

  publish(event: AppEvent): void {
    this.emitter.emit('event', event);
  }

  /** Returns the function that unsubscribes. */
  subscribe(listener: Listener): () => void {
    // One failing subscriber must not break publish for the others.
    const safe: Listener = (event) => {
      try {
        listener(event);
      } catch {
        /* subscriber errors are the subscriber's problem */
      }
    };
    this.emitter.on('event', safe);
    return () => this.emitter.off('event', safe);
  }

  get subscriberCount(): number {
    return this.emitter.listenerCount('event');
  }
}
