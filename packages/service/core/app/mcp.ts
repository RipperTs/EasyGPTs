import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { addLog } from '../../common/system/log';
import { delay } from '@fastgpt/global/common/system/utils';

export class MCPClient {
  private client: Client;
  private url: string;
  private headers: Record<string, any> = {};

  constructor(config: { url: string; headers: Record<string, any> }) {
    this.url = config.url;
    this.headers = config.headers;
    this.client = new Client({ name: 'FastGPT-MCP-client', version: '1.0.0' });
  }

  private async getConnection(): Promise<Client> {
    try {
      const transport = new StreamableHTTPClientTransport(new URL(this.url), {
        requestInit: { headers: this.headers }
      });
      await this.client.connect(transport);
      return this.client;
    } catch (error) {
      await this.client.connect(
        new SSEClientTransport(new URL(this.url), {
          requestInit: { headers: this.headers },
          eventSourceInit: {
            fetch: (url, init) => {
              const headers = new Headers({ ...(init?.headers || {}), ...this.headers });
              return fetch(url, { ...(init || {}), headers });
            }
          }
        })
      );
      return this.client;
    }
  }

  private async closeConnection() {
    try {
      await this.client.close();
    } catch (e) {
      addLog.warn('[MCP Client] close failed once, retrying...');
      await delay(100);
      try {
        await this.client.close();
      } catch (err) {
        addLog.error('[MCP Client] Failed to close connection:', err);
      }
    }
  }

  public async getTools(): Promise<
    { name: string; description: string; inputSchema: Record<string, any> }[]
  > {
    try {
      const client = await this.getConnection();
      const response = await client.listTools();
      const toolsArr = Array.isArray(response.tools) ? response.tools : [];
      return toolsArr.map((tool: any) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema
          ? { ...tool.inputSchema, properties: tool.inputSchema.properties || {} }
          : { type: 'object', properties: {} }
      }));
    } catch (error) {
      addLog.error('[MCP Client] Failed to get tools:', error);
      return Promise.reject(error);
    } finally {
      await this.closeConnection();
    }
  }

  public async toolCall(toolName: string, params: Record<string, any>): Promise<any> {
    try {
      const client = await this.getConnection();
      addLog.debug(`[MCP Client] Call tool: ${toolName}`, params);
      return await client.callTool({ name: toolName, arguments: params }, undefined, {
        timeout: 300000
      });
    } catch (error) {
      addLog.error(`[MCP Client] Failed to call tool ${toolName}:`, error);
      return Promise.reject(error);
    } finally {
      await this.closeConnection();
    }
  }
}
