import dgram from 'node:dgram';
import {isIPv6} from 'node:net';
import {inject} from 'inversify';
import {AppConfig} from '../app.config.js';
import {Component} from '../stereotypes.js';
import {TransportMessage} from './transport-message.js';

/**
 * UDP speaking JSON datagrams: {"type":"ping","id":1} -> {"type":"pong","id":1}.
 *
 * UDP source addresses can be spoofed, so this server is built not to be an
 * amplifier: it never sends a reply larger than the datagram it received, and
 * it ignores datagrams over 1 KB. There is no auth; put anything sensitive on
 * TCP (TLS) or HTTPS instead.
 */
@Component()
export class UdpServer {
  static readonly MAX_DATAGRAM_BYTES = 1024;

  private socket?: dgram.Socket;

  constructor(@inject(AppConfig) private readonly config: AppConfig) {}

  async start(port: number = this.config.env.UDP_PORT): Promise<void> {
    if (!this.config.env.UDP_ENABLED) return;
    const host = this.config.env.HOST;
    this.socket = dgram.createSocket(isIPv6(host) ? 'udp6' : 'udp4');
    this.socket.on('message', (datagram, remote) => {
      const reply = this.reply(datagram);
      if (reply) this.socket?.send(reply, remote.port, remote.address);
    });
    await new Promise<void>((resolve, reject) => {
      this.socket!.once('error', reject);
      this.socket!.bind(port, host, resolve);
    });
  }

  get port(): number | undefined {
    return this.socket?.address().port;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) =>
      this.socket ? this.socket.close(() => resolve()) : resolve(),
    );
  }

  /** null means send nothing. */
  reply(datagram: Buffer): Buffer | null {
    if (datagram.length > UdpServer.MAX_DATAGRAM_BYTES) return null;
    const message = TransportMessage.parse(datagram.toString('utf8'));
    if (!message) return null;
    const id = message.payload.id ?? null;
    let reply: string;
    switch (message.type) {
      case 'ping':
        reply = TransportMessage.encode('pong', {id});
        break;
      case 'echo':
        reply = TransportMessage.encode('echo', message.payload);
        break;
      default:
        return null;
    }
    const bytes = Buffer.from(reply);
    return bytes.length <= datagram.length ? bytes : null;
  }
}
