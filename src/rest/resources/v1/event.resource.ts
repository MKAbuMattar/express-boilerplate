import {Controller, Get, Request, Response} from '@inversifyjs/http-core';
import {OasSummary} from '@inversifyjs/http-open-api';
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from 'express';
import {inject} from 'inversify';
import {ApiConstants} from '../../../constant/api.constants.js';
import type {AppEvent} from '../../../model/app-event.js';
import {EventBus} from '../../../service/event-bus.service.js';

/**
 * Server-Sent Events: one long HTTP response the browser reads with
 * `new EventSource('/api/v1/events')`. Reconnects are automatic; events carry
 * ids only, so the stream is public.
 */
@Controller(ApiConstants.V1_EVENTS)
export class EventV1Resource {
  static readonly HEARTBEAT_MS = 15_000;

  constructor(@inject(EventBus) private readonly eventBus: EventBus) {}

  @OasSummary('Live event stream (text/event-stream)')
  @Get()
  stream(
    @Request() request: ExpressRequest,
    @Response() response: ExpressResponse,
  ): void {
    response.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no', // tell nginx not to buffer the stream
    });
    response.write('retry: 3000\n\n');

    const send = (event: AppEvent) => {
      response.write(
        `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      );
    };
    const unsubscribe = this.eventBus.subscribe(send);
    // Comments keep proxies from closing an idle connection.
    const heartbeat = setInterval(
      () => response.write(': heartbeat\n\n'),
      EventV1Resource.HEARTBEAT_MS,
    );
    request.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
