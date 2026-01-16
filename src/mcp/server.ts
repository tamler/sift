#!/usr/bin/env node
// Sift MCP Server
// Exposes document search to Claude via Model Context Protocol

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTools } from './tools.js';
import { Database } from '../core/database.js';
import { EmbeddingsClient } from '../core/embeddings.js';
import { loadConfig, updateConfig, expandPath } from '../core/config.js';

async function main() {
  // Load configuration
  const config = await loadConfig();

  // Create embeddings client from config
  const embeddings = new EmbeddingsClient({
    provider: config.embeddings.provider,
    model: config.embeddings.model,
    baseUrl: config.embeddings.baseUrl,
    apiKey: config.embeddings.apiKey,
  });

  // Check if Ollama is available when using ollama provider
  if (config.embeddings.provider === 'ollama') {
    const ollamaAvailable = await EmbeddingsClient.detectOllama(
      config.embeddings.baseUrl
    );
    if (!ollamaAvailable) {
      console.error(
        `Warning: Ollama not detected at ${config.embeddings.baseUrl}. ` +
        `Make sure Ollama is running and the model '${config.embeddings.model}' is pulled.`
      );
    }
  }

  // Get embedding dimension (makes a test call if needed)
  let dimension = config.embeddings.dimension;
  if (!dimension) {
    try {
      dimension = await embeddings.getDimension();
      // Save dimension to config for future reference
      await updateConfig({
        embeddings: { ...config.embeddings, dimension },
      });
      console.error(`Detected embedding dimension: ${dimension}`);
    } catch (error) {
      console.error(`Failed to detect embedding dimension: ${error}`);
      console.error('Using default dimension of 384');
      dimension = 384;
    }
  }

  // Initialize database with the detected dimension
  const db = new Database(expandPath(config.database), dimension);
  await db.init();

  // Create MCP server
  const server = new McpServer({
    name: 'sift',
    version: '0.1.0',
  });

  // Register tools
  registerTools(server, db, embeddings, config);

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Sift MCP server running');
  console.error(`Embedding model: ${config.embeddings.model} (${dimension}d)`);
  console.error(`Database: ${expandPath(config.database)}`);
}

main().catch((error) => {
  console.error('Failed to start Sift:', error);
  process.exit(1);
});
