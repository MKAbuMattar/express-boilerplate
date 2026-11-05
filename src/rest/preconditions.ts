import {ErrorHttpResponse} from '@inversifyjs/http-core';
import {ApiResponse} from './dto/api-response.dto.js';

/**
 * Conditional requests (RFC 9110 section 13) for optimistic locking:
 * send the ETag you read as If-Match, and a write fails with 412 when someone
 * changed the resource in between. If-None-Match: * means "create only".
 *
 * shortcut: check-then-write is not atomic, so two writers in the same few
 * milliseconds can both pass; add a version column with a conditional UPDATE
 * when that matters.
 */
export class Preconditions {
  static check(
    currentEtag: string | null,
    ifMatch: string | undefined,
    ifNoneMatch: string | undefined,
  ): void {
    if (ifMatch !== undefined) {
      const tags = Preconditions.tags(ifMatch);
      const ok =
        currentEtag !== null &&
        (tags.includes('*') || tags.includes(currentEtag));
      if (!ok)
        throw Preconditions.failed('If-Match does not match the current ETag');
    }
    if (ifNoneMatch !== undefined && currentEtag !== null) {
      const tags = Preconditions.tags(ifNoneMatch);
      if (tags.includes('*') || tags.includes(currentEtag)) {
        throw Preconditions.failed('The resource already exists');
      }
    }
  }

  private static tags(header: string): string[] {
    return header.split(',').map((tag) => tag.trim().replace(/^W\//, ''));
  }

  private static failed(message: string) {
    return new ErrorHttpResponse(412, ApiResponse.fail(message));
  }
}
