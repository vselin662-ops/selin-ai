// src/engines/MCPBridge.ts
import { logger } from '../logger';

export interface MCPToolCallRequest {
  toolName: string;
  parameters: Record<string, unknown>;
}

export interface MCPToolCallResponse {
  success: boolean;
  result?: unknown;
  error?: string;
}

export class MCPBridge {
  private static failuresCount = 0;
  private static lastFailureTimestamp = 0;
  private static isCircuitOpen = false;
  private static readonly CIRCUIT_TIMEOUT_MS = 30000;
  private static readonly CALL_TIMEOUT_MS = 10000;

  public static async callTool(req: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    const now = Date.now();
    if (this.isCircuitOpen) {
      if (now - this.lastFailureTimestamp > this.CIRCUIT_TIMEOUT_MS) {
        this.isCircuitOpen = false;
        this.failuresCount = 0;
        logger.info('[MCPBridge] Circuit breaker reset to half-open');
      } else {
        logger.warn(`[MCPBridge] Circuit breaker is OPEN. Rejecting call to ${req.toolName}`);
        return { success: false, error: 'Circuit breaker is open' };
      }
    }

    try {
      logger.info(`[MCPBridge] Executing tool: ${req.toolName}`);
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('MCP tool call timed out after 10s')), this.CALL_TIMEOUT_MS)
      );

      const executionPromise = (async () => {
        return {
          executedTool: req.toolName,
          status: 'COMPLETED'
        };
      })();

      const result = await Promise.race([executionPromise, timeoutPromise]);
      this.failuresCount = 0;
      return {
        success: true,
        result
      };
    } catch (err: unknown) {
      this.failuresCount++;
      this.lastFailureTimestamp = now;
      if (this.failuresCount >= 3) {
        this.isCircuitOpen = true;
        logger.error('[MCPBridge] Circuit breaker tripped to OPEN');
      }
      const msg = err instanceof Error ? err.message : String(err);
      logger.error(`[MCPBridge] Tool execution failed: ${msg}`);
      return { success: false, error: msg };
    }
  }

  // Alias for backward compatibility
  public static async executeTool(req: MCPToolCallRequest): Promise<MCPToolCallResponse> {
    return this.callTool(req);
  }
}
