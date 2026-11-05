import {isIP} from 'node:net';
import {ApiResponse} from '@express-boilerplate/common/rest/dto/api-response.dto.js';
import {BadRequestHttpResponse} from '@inversifyjs/http-core';

/**
 * A host to ping: an IP address or an RFC 1123 hostname, nothing else.
 * This allow-list is what keeps shell metacharacters and option injection
 * (a host starting with "-") away from the ping command.
 */
export class PingRequestDto {
  private static readonly HOSTNAME =
    /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/i;

  private constructor(readonly host: string) {}

  static from(body: unknown): PingRequestDto {
    const host = (body as {host?: unknown} | null)?.host;
    if (
      typeof host !== 'string' ||
      !(isIP(host) !== 0 || PingRequestDto.HOSTNAME.test(host))
    ) {
      throw new BadRequestHttpResponse(
        ApiResponse.fail('Validation failed', {
          host: 'must be an IP address or a hostname',
        }),
      );
    }
    return new PingRequestDto(host);
  }
}
