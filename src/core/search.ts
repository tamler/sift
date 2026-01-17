// Search
// Vector similarity search across indexed documents

import type { Database } from './database.js';
import type { EmbeddingsClient } from './embeddings.js';
import { expandPath } from './config.js';
import { resolve } from 'node:path';

export interface SearchResult {
  file: string;
  content: string;
  score: number;
  chunkIndex: number;
}

export async function search(
  query: string,
  db: Database,
  embeddings: EmbeddingsClient,
  options: { limit?: number; folder?: string } = {}
): Promise<SearchResult[]> {
  // Validate query
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    throw new Error('Search query cannot be empty');
  }

  const { limit = 10 } = options;

  // Embed the query
  const queryEmbedding = await embeddings.embed(query.trim());

  // Search the database
  const results = await db.search(queryEmbedding, limit);

  // Filter by folder if specified
  let filtered = results;
  if (options.folder) {
    // Normalize and expand the folder path for consistent matching
    const normalizedFolder = resolve(expandPath(options.folder));
    filtered = results.filter((r) => r.filePath.startsWith(normalizedFolder));
  }

  // Map to SearchResult format
  return filtered.map((doc) => ({
    file: doc.filePath,
    content: doc.content,
    score: doc.score,
    chunkIndex: doc.chunkIndex,
  }));
}
