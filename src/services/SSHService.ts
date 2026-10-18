import { Client } from 'ssh2';
import { logger } from '../logger';

export interface SSHResult {
  stdout: string;
  stderr: string;
  code?: number | null;
  error?: string;
}

export class SSHService {
  private static config = {
    host: process.env.REMOTE_VM_HOST || '176.108.252.111',
    port: 22,
    username: process.env.REMOTE_VM_USER || 'ubuntu',
    privateKey: process.env.REMOTE_VM_KEY?.replace(/\\n/g, '\n'), // Поддержка ключа из переменной окружения
  };

  public static isConfigured(): boolean {
    return !!(this.config.host && this.config.username && this.config.privateKey);
  }

  public static async executeRemote(command: string): Promise<SSHResult> {
    return new Promise((resolve) => {
      const conn = new Client();
      let stdout = '';
      let stderr = '';

      conn.on('ready', () => {
        logger.info(`📡 [SSH] Connected to ${this.config.host}. Executing: ${command}`);
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return resolve({ stdout, stderr, error: err.message });
          }
          
          stream.on('close', (code: number | null) => {
            conn.end();
            resolve({ stdout, stderr, code });
          }).on('data', (data: any) => {
            stdout += data.toString();
          }).stderr.on('data', (data: any) => {
            stderr += data.toString();
          });
        });
      }).on('error', (err) => {
        logger.error(`❌ [SSH] Connection error: ${err.message}`);
        resolve({ stdout, stderr, error: `Connection failed: ${err.message}` });
      }).connect(this.config);
    });
  }
}
