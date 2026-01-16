// Search
// Vector similarity search across indexed documents

import type { Database, Document } from './database.js';
import type { EmbeddingsClient } from './embeddings.js';

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
  const { limit = 10 } = options;

  // Embed the query
  const queryEmbedding = await embeddings.embed(query);

  // Search the database
  const results = await db.search(queryEmbedding, limit);

  // Filter by folder if specified
  let filtered = results;
  if (options.folder) {
    filtered = results.filter((r) => r.filePath.startsWith(options.folder!));
  }

  // Map to SearchResult format
  return filtered.map((doc) => ({
    file: doc.filePath,
    content: doc.content,
    score: (doc as Document & { score: number }).score,
    chunkIndex: doc.chunkIndex,
  }));
}
