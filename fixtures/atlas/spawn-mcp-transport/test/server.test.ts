import { expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';

const SERVER = fileURLToPath(new URL('../src/server.ts', import.meta.url));

it('lists its tools', async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', SERVER] });
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(transport);
  expect(await client.listTools()).toBeDefined();
  await client.close();
});
