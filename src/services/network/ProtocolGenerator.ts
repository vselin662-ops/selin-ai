import crypto from 'crypto';

export interface VLESSConfig {
  uuid: string;
  serverIp: string;
  port: number;
  clientName: string;
  sni?: string;
  publicKey?: string;
  shortId?: string;
  flow?: string;
}

export interface ShadowsocksConfig {
  method: string;
  password: string;
  serverIp: string;
  port: number;
  clientName: string;
}

/**
 * ProtocolGenerator creates standard, RFC-compliant links for modern clients like Happ, v2rayNG, Shadowrocket, Sing-box, etc.
 */
export class ProtocolGenerator {
  /**
   * Generates a standard VLESS Reality / TCP / WS link that Happ imports in 1 click.
   */
  public static generateVLESS(config: VLESSConfig): string {
    const { uuid, serverIp, port, clientName, sni = 'yahoo.com', publicKey, shortId, flow = 'xtls-rprx-vision' } = config;
    const name = encodeURIComponent(`SelinAI_${clientName.replace(/\s+/g, '_')}`);
    
    if (publicKey) {
      // VLESS Reality (Modern standard against DPI)
      return `vless://${uuid}@${serverIp}:${port}?security=reality&encryption=none&pbk=${publicKey}&headerType=none&fp=chrome&spx=%2F&type=tcp&flow=${flow}&sni=${sni}${shortId ? `&sid=${shortId}` : ''}#${name}`;
    }

    // Standard VLESS over WebSocket
    return `vless://${uuid}@${serverIp}:${port}?encryption=none&security=none&type=ws&path=%2Fselin-ws#${name}`;
  }

  /**
   * Generates a standard Shadowsocks 2022 / AEAD link for Happ and other clients.
   */
  public static generateShadowsocks(config: ShadowsocksConfig): string {
    const { method = 'chacha20-ietf-poly1305', password, serverIp, port, clientName } = config;
    const name = encodeURIComponent(`SelinAI_${clientName.replace(/\s+/g, '_')}`);
    const userInfo = Buffer.from(`${method}:${password}`).toString('base64');
    return `ss://${userInfo}@${serverIp}:${port}#${name}`;
  }
}
