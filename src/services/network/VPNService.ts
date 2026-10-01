import { Socket } from 'net';
import * as net from 'net';
import { sqliteDb } from '../../../db';
import { logger } from '../../logger';

export interface VPNStatus {
  active: boolean;
  port: number;
  connections: number;
  uptime: number;
  bytesIn: number;
  bytesOut: number;
  startTime?: number;
}

/**
 * Selin VPN Service (SOCKS5 Implementation)
 * Provides a custom proxy tunnel within the Selin AI ecosystem.
 */
export class VPNService {
  private static instance: VPNService;
  private server: net.Server | null = null;
  private status: VPNStatus = {
    active: false,
    port: 1080,
    connections: 0,
    uptime: 0,
    bytesIn: 0,
    bytesOut: 0
  };

  private constructor() {}

  public static getInstance(): VPNService {
    if (!VPNService.instance) {
      VPNService.instance = new VPNService();
    }
    return VPNService.instance;
  }

  public async start(port: number = 1080): Promise<void> {
    if (this.server) return;

    this.server = net.createServer((socket: Socket) => {
      this.handleConnection(socket);
    });

    return new Promise((resolve, reject) => {
      this.server?.listen(port, '0.0.0.0', () => {
        this.status.active = true;
        this.status.port = port;
        this.status.startTime = Date.now();
        console.log(`[VPN] Selin Secure Tunnel (SOCKS5) active on port ${port}`);
        resolve();
      });

      this.server?.on('error', (err) => {
        console.error('[VPN] Server error:', err);
        reject(err);
      });
    });
  }

  public stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.status.active = false;
      this.status.startTime = undefined;
    }
  }

  public getStatus(): VPNStatus {
    if (this.status.startTime) {
      this.status.uptime = Math.floor((Date.now() - this.status.startTime) / 1000);
    }
    return { ...this.status };
  }

  private async authenticate(socket: Socket): Promise<string | null> {
    return new Promise((resolve) => {
      socket.once('data', (data) => {
        if (data[0] !== 0x01) { // Sub-negotiation version 1
          socket.write(Buffer.from([0x01, 0x01]));
          return resolve(null);
        }

        const uLen = data[1];
        const username = data.toString('utf8', 2, 2 + uLen);
        const pLen = data[2 + uLen];
        const password = data.toString('utf8', 3 + uLen, 3 + uLen + pLen);

        try {
          if (sqliteDb) {
            const client = sqliteDb.prepare("SELECT id, status FROM vpn_clients WHERE username = ? AND password = ?").get(username, password);
            if (client && client.status === 'active') {
              socket.write(Buffer.from([0x01, 0x00])); // Success
              return resolve(client.id);
            }
          }
        } catch (e) {
          logger.error(`[VPN] Auth DB Error: ${e}`);
        }

        socket.write(Buffer.from([0x01, 0x01])); // Failure
        resolve(null);
      });
    });
  }

  private handleConnection(socket: Socket) {
    this.status.connections++;
    
    socket.once('data', async (data) => {
      if (data[0] !== 0x05) {
        socket.destroy();
        this.status.connections--;
        return;
      }

      const methodsCount = data[1];
      const methods = data.slice(2, 2 + methodsCount);
      
      // We prefer User/Pass (0x02) for commercial use
      if (methods.includes(0x02)) {
        socket.write(Buffer.from([0x05, 0x02])); // Select User/Pass auth
        const clientId = await this.authenticate(socket);
        if (!clientId) {
          socket.destroy();
          this.status.connections--;
          return;
        }
        // Proceed to command
        this.handleCommand(socket, clientId);
      } else {
        // No Auth (0x00) fallback if no clients exist? 
        // For commercial, we block no-auth
        socket.write(Buffer.from([0x05, 0xFF])); // No acceptable methods
        socket.destroy();
        this.status.connections--;
      }
    });
  }

  private handleCommand(socket: Socket, clientId: string) {
    socket.once('data', (data) => {
      if (data[0] !== 0x05) {
        socket.destroy();
        return;
      }
      
      const cmd = data[1];
      const atyp = data[3];
      
      if (cmd !== 0x01) { // Only CONNECT command supported
        socket.write(Buffer.from([0x05, 0x07, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
        socket.destroy();
        return;
      }

      let addr = '';
      let port = 0;

      if (atyp === 0x01) { // IPv4
        addr = `${data[4]}.${data[5]}.${data[6]}.${data[7]}`;
        port = data.readUInt16BE(8);
      } else if (atyp === 0x03) { // Domain name
        const len = data[4];
        addr = data.toString('utf8', 5, 5 + len);
        port = data.readUInt16BE(5 + len);
      } else if (atyp === 0x04) { // IPv6
        socket.write(Buffer.from([0x05, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
        socket.destroy();
        return;
      }

      const remote = net.createConnection({ host: addr, port: port }, () => {
        socket.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
        
        // Selin Neural Shield
        socket.pipe(remote);
        remote.pipe(socket);
      });

      remote.on('data', (d) => { 
        this.status.bytesOut += d.length; 
        if (sqliteDb) {
          sqliteDb.prepare("UPDATE vpn_clients SET bytes_used = bytes_used + ? WHERE id = ?").run(d.length, clientId);
        }
      });
      
      socket.on('data', (d) => { 
        this.status.bytesIn += d.length; 
        if (sqliteDb) {
          sqliteDb.prepare("UPDATE vpn_clients SET bytes_used = bytes_used + ? WHERE id = ?").run(d.length, clientId);
        }
      });

      remote.on('error', () => socket.destroy());
      socket.on('error', () => remote.destroy());
      socket.on('close', () => {
        remote.destroy();
        this.status.connections--;
      });
      remote.on('close', () => socket.destroy());
    });
  }
}
