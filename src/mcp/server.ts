#!/usr/bin/env node
// Sift MCP Server
// Exposes document search to Claude via Model Context Protocol

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { Database } from '../core/database.js';
import { EmbeddingsClient } from '../core/embeddings.js';

async function main() {
  // Initialize database and embeddings
  const db = new Database();
  await db.init();

  // Auto-detect Ollama, fall back to config
  const hasOllama = await EmbeddingsClient.detectOllama();
  const embeddings = new EmbeddingsClient({
    provider: hasOllama ? 'ollama' : 'voyage',
    model: hasOllama ? 'nomic-embed-text' : 'voyage-3',
  });

  // Create MCP server
  const server = new McpServer({
    name: 'sift',
    version: '0.1.0',
  });

  // Register tools
  registerTools(server, db, embeddings);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Sift MCP server running');
}

main().catch((error) => {
  console.error('Failed to start Sift:', error);
  process.exit(1);
});
