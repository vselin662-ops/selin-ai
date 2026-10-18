import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';
import * as net from 'net';
import * as dgram from 'dgram';
import { sqliteDb } from '../../../db';
import { logger } from '../../logger';

function formatUUID(buf: Buffer): string {
  if (buf.length < 16) return '';
  const hex = buf.toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
}

/**
 * NativeVLESSEngine
 * Implements a pure Node.js VLESS-over-WebSocket server with TCP & UDP (DNS) tunneling.
 * Enables direct 1-click connections from Happ, v2rayNG, Shadowrocket, Sing-box without external panels.
 */
export class NativeVLESSEngine {
  private static instance: NativeVLESSEngine;
  private wss: WebSocketServer | null = null;
  private activeConnections = 0;

  private constructor() {}

  public static getInstance(): NativeVLESSEngine {
    if (!NativeVLESSEngine.instance) {
      NativeVLESSEngine.instance = new NativeVLESSEngine();
    }
    return NativeVLESSEngine.instance;
  }

  /**
   * Attaches the VLESS WebSocket handler to an existing HTTP server instance on path /selin-ws
   */
  public attach(server: HttpServer, path: string = '/selin-ws') {
    if (this.wss) return;

    this.wss = new WebSocketServer({
      noServer: true,
      handleProtocols: (protocols) => {
        const list = Array.from(protocols);
        return list[0] || false;
      }
    });

    server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === path || url.pathname === `${path}/`) {
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          this.wss?.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws: WebSocket) => {
      this.handleVlessConnection(ws);
    });

    logger.info(`🚀 [VLESS] Native VLESS-over-WebSocket engine active on path ${path}`);
    console.log(`🚀 [VLESS] Native VLESS engine listening on WS path ${path} (TCP + UDP DNS enabled)`);
  }

  private handleVlessConnection(ws: WebSocket) {
    this.activeConnections++;
    let isHeaderParsed = false;
    let isUdp = false;
    let targetSocket: net.Socket | null = null;
    let udpSocket: dgram.Socket | null = null;
    let clientId: string | null = null;
    let clientName = 'Unknown';
    let targetHost = '';
    let targetPort = 0;
    let udpResponseHeaderSent = false;
    let udpIdleTimer: NodeJS.Timeout | null = null;

    const resetUdpIdle = () => {
      if (udpIdleTimer) clearTimeout(udpIdleTimer);
      udpIdleTimer = setTimeout(() => {
        try { udpSocket?.close(); } catch (_) {}
        try { ws.close(); } catch (_) {}
      }, 60000);
    };

    const sendUdpPayload = (payload: Buffer) => {
      resetUdpIdle();
      let pCursor = 0;
      while (pCursor < payload.length) {
        if (pCursor + 2 > payload.length) {
          // Send remaining directly
          udpSocket?.send(payload.subarray(pCursor), targetPort, targetHost);
          break;
        }
        const pktLen = payload.readUInt16BE(pCursor);
        pCursor += 2;
        if (pCursor + pktLen > payload.length) {
          udpSocket?.send(payload.subarray(pCursor - 2), targetPort, targetHost);
          break;
        }
        const packet = payload.subarray(pCursor, pCursor + pktLen);
        pCursor += pktLen;

        udpSocket?.send(packet, targetPort, targetHost, (err) => {
          if (err) {
            console.error(`[VLESS UDP] Failed to forward packet to ${targetHost}:${targetPort}: ${err.message}`);
          }
        });
      }
    };

    ws.on('message', (message: Buffer) => {
      if (!isHeaderParsed) {
        // Parse VLESS Request Header
        if (message.length < 24) {
          ws.close();
          return;
        }

        const version = message[0];
        if (version !== 0x00) {
          ws.close();
          return;
        }

        const rawUuid = message.subarray(1, 17);
        const uuidStr = formatUUID(rawUuid);

        // Validate UUID in sqlite database
        try {
          if (sqliteDb) {
            const client = sqliteDb.prepare('SELECT id, status, client_name FROM vpn_clients WHERE LOWER(uuid) = LOWER(?)').get(uuidStr);
            if (!client || client.status !== 'active') {
              console.warn(`⚠️ [VLESS] Rejected unauthorized UUID attempt: ${uuidStr}`);
              ws.close();
              return;
            }
            clientId = client.id;
            clientName = client.client_name;
          }
        } catch (dbErr) {
          console.error('[VLESS] DB check error:', dbErr);
        }

        const addonLen = message[17];
        let cursor = 18 + addonLen;

        const cmd = message[cursor]; // 0x01 = TCP, 0x02 = UDP
        if (cmd !== 0x01 && cmd !== 0x02) {
          console.warn(`[VLESS] Unsupported command: ${cmd}`);
          ws.close();
          return;
        }

        const port = message.readUInt16BE(cursor + 1);
        const addrType = message[cursor + 3];
        cursor += 4;

        let host = '';
        if (addrType === 0x01) { // IPv4
          host = `${message[cursor]}.${message[cursor + 1]}.${message[cursor + 2]}.${message[cursor + 3]}`;
          cursor += 4;
        } else if (addrType === 0x02) { // Domain
          const domainLen = message[cursor];
          cursor += 1;
          host = message.toString('utf8', cursor, cursor + domainLen);
          cursor += domainLen;
        } else if (addrType === 0x03) { // IPv6
          host = message.subarray(cursor, cursor + 16).toString('hex');
          cursor += 16;
        } else {
          ws.close();
          return;
        }

        targetHost = host;
        targetPort = port;
        isHeaderParsed = true;

        const initialPayload = message.subarray(cursor);

        if (cmd === 0x02) {
          // --- UDP TUNNEL (DNS / UDP) ---
          isUdp = true;
          console.log(`📡 [VLESS UDP] Forwarding for [${clientName}] -> ${host}:${port} (Payload: ${initialPayload.length}B)`);

          udpSocket = dgram.createSocket('udp4');

          udpSocket.on('message', (msg) => {
            resetUdpIdle();
            if (ws.readyState === WebSocket.OPEN) {
              const lenBuf = Buffer.alloc(2);
              lenBuf.writeUInt16BE(msg.length, 0);

              if (!udpResponseHeaderSent) {
                udpResponseHeaderSent = true;
                // VLESS response header (version 0, addon length 0) + length-prefixed packet
                ws.send(Buffer.concat([Buffer.from([0x00, 0x00]), lenBuf, msg]));
              } else {
                ws.send(Buffer.concat([lenBuf, msg]));
              }

              if (clientId && sqliteDb) {
                try {
                  sqliteDb.prepare('UPDATE vpn_clients SET bytes_used = bytes_used + ? WHERE id = ?').run(msg.length, clientId);
                } catch (_) {}
              }
            }
          });

          udpSocket.on('error', (err) => {
            console.error(`[VLESS UDP] Socket error (${host}:${port}): ${err.message}`);
            try { udpSocket?.close(); } catch (_) {}
            try { ws.close(); } catch (_) {}
          });

          if (initialPayload.length > 0) {
            sendUdpPayload(initialPayload);
          }

        } else {
          // --- TCP TUNNEL ---
          console.log(`🌐 [VLESS TCP] Connecting for [${clientName}] -> ${host}:${port}`);

          targetSocket = net.createConnection({ host, port }, () => {
            // Send VLESS response header: version 0, addon length 0
            ws.send(Buffer.from([0x00, 0x00]));

            // Forward initial payload if present
            if (initialPayload.length > 0) {
              targetSocket?.write(initialPayload);
            }
          });

          targetSocket.on('data', (data) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(data);
            }
            if (clientId && sqliteDb) {
              try {
                sqliteDb.prepare('UPDATE vpn_clients SET bytes_used = bytes_used + ? WHERE id = ?').run(data.length, clientId);
              } catch (_) {}
            }
          });

          targetSocket.on('error', (err) => {
            console.error(`[VLESS TCP] Target connection error (${host}:${port}): ${err.message}`);
            ws.close();
          });

          targetSocket.on('close', () => {
            ws.close();
          });
        }

      } else {
        // Subsequent packets
        if (isUdp) {
          sendUdpPayload(message);
        } else if (targetSocket && !targetSocket.destroyed) {
          targetSocket.write(message);
        }

        if (clientId && sqliteDb) {
          try {
            sqliteDb.prepare('UPDATE vpn_clients SET bytes_used = bytes_used + ? WHERE id = ?').run(message.length, clientId);
          } catch (_) {}
        }
      }
    });

    ws.on('close', () => {
      this.activeConnections = Math.max(0, this.activeConnections - 1);
      if (udpIdleTimer) clearTimeout(udpIdleTimer);
      if (targetSocket && !targetSocket.destroyed) {
        targetSocket.destroy();
      }
      if (udpSocket) {
        try { udpSocket.close(); } catch (_) {}
      }
    });

    ws.on('error', () => {
      if (udpIdleTimer) clearTimeout(udpIdleTimer);
      if (targetSocket && !targetSocket.destroyed) {
        targetSocket.destroy();
      }
      if (udpSocket) {
        try { udpSocket.close(); } catch (_) {}
      }
    });
  }

  public getStatus() {
    return {
      active: true,
      connections: this.activeConnections,
      protocol: 'VLESS-over-WebSocket'
    };
  }
}

export const nativeVLESSEngine = NativeVLESSEngine.getInstance();
