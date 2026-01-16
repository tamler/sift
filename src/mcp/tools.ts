// MCP Tool Implementations
// sift_search, sift_list, sift_read, sift_index, sift_status

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { Database } from '../core/database.js';
import type { EmbeddingsClient } from '../core/embeddings.js';
import { search } from '../core/search.js';
import { Indexer } from '../core/indexer.js';

export function registerTools(
  server: McpServer,
  db: Database,
  embeddings: EmbeddingsClient
): void {
  // sift_search - Semantic search across indexed documents
  server.tool(
    'sift_search',
    'Semantic search across indexed documents',
    {
      query: z.string().describe('What to search for'),
      limit: z.number().optional().default(10).describe('Max results'),
      folder: z.string().optional().describe('Filter to specific folder'),
    },
    async ({ query, limit, folder }) => {
      const results = await search(query, db, embeddings, { limit, folder });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    }
  );

  // sift_list - List indexed files and folders
  server.tool(
    'sift_list',
    'List indexed files and folders',
    {
      folder: z.string().optional().describe('Filter to folder'),
      stats: z.boolean().optional().default(false).describe('Include chunk counts'),
    },
    async ({ folder, stats }) => {
      let files = await db.listFiles();

      if (folder) {
        files = files.filter((f) => f.path.startsWith(folder));
      }

      const totalStats = await db.getStats();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                files: stats ? files : files.map((f) => ({ path: f.path })),
                total_files: totalStats.totalFiles,
                total_chunks: totalStats.totalChunks,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // sift_read - Get all chunks from a specific file
  server.tool(
    'sift_read',
    'Get all chunks from a specific file',
    {
      file: z.string().describe('File path'),
    },
    async ({ file }) => {
      const chunks = await db.getFileChunks(file);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                file,
                chunks: chunks.map((c) => ({
                  index: c.chunkIndex,
                  content: c.content,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // sift_index - Trigger indexing of a folder
  server.tool(
    'sift_index',
    'Trigger indexing of a folder',
    {
      folder: z.string().describe('Folder to index'),
      recursive: z.boolean().optional().default(true).describe('Include subfolders'),
    },
    async ({ folder, recursive }) => {
      const indexer = new Indexer();

      try {
        const chunks = await indexer.indexFolder(folder, recursive);

        // Embed and store each chunk
        let filesIndexed = new Set<string>();
        let chunksCreated = 0;
        const errors: string[] = [];

        for (const chunk of chunks) {
          try {
            const embedding = await embeddings.embed(chunk.content);
            await db.insert({
              filePath: chunk.file,
              chunkIndex: chunk.index,
              content: chunk.content,
              embedding,
            });
            filesIndexed.add(chunk.file);
            chunksCreated++;
          } catch (error) {
            errors.push(`Failed to index chunk ${chunk.index} of ${chunk.file}: ${error}`);
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  files_indexed: filesIndexed.size,
                  chunks_created: chunksCreated,
                  errors,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: String(error) }, null, 2),
            },
          ],
          isError: true,
        };
      }
    }
  );

  // sift_status - Get indexer status and configuration
  server.tool(
    'sift_status',
    'Get indexer status and configuration',
    {},
    async () => {
      const stats = await db.getStats();
      const files = await db.listFiles();
      const folders = [...new Set(files.map((f) => f.path.split('/').slice(0, -1).join('/')))];

      const hasOllama = await EmbeddingsClient.detectOllama();

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                indexed_folders: folders,
                total_files: stats.totalFiles,
                total_chunks: stats.totalChunks,
                embedding_provider: hasOllama ? 'ollama' : 'api',
                last_indexed: files.length > 0
                  ? files.reduce((latest, f) =>
                      f.indexedAt > latest ? f.indexedAt : latest, files[0].indexedAt)
                  : null,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
