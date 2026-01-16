// Database
// PGLite with pgvector for local vector storage

import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite/vector';

export interface Document {
  id: number;
  filePath: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
  indexedAt: string;
}

export class Database {
  private db: PGlite | null = null;
  private dbPath: string;

  constructor(dbPath = '~/.sift/sift.db') {
    this.dbPath = dbPath.replace('~', process.env.HOME || '');
  }

  async init(): Promise<void> {
    this.db = await PGlite.create({
      dataDir: this.dbPath,
      extensions: { vector },
    });

    await this.db.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        file_path TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        embedding vector(384),
        indexed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(file_path, chunk_index)
      );

      CREATE INDEX IF NOT EXISTS idx_embedding
        ON documents USING ivfflat (embedding vector_cosine_ops);
    `);
  }

  async insert(doc: Omit<Document, 'id' | 'indexedAt'>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.query(
      `INSERT INTO documents (file_path, chunk_index, content, embedding)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (file_path, chunk_index)
       DO UPDATE SET content = $3, embedding = $4, indexed_at = CURRENT_TIMESTAMP`,
      [doc.filePath, doc.chunkIndex, doc.content, JSON.stringify(doc.embedding)]
    );
  }

  async search(embedding: number[], limit = 10): Promise<Document[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query<Document>(
      `SELECT id, file_path as "filePath", chunk_index as "chunkIndex",
              content, indexed_at as "indexedAt",
              1 - (embedding <=> $1) as score
       FROM documents
       ORDER BY embedding <=> $1
       LIMIT $2`,
      [JSON.stringify(embedding), limit]
    );

    return result.rows;
  }

  async listFiles(): Promise<{ path: string; chunks: number; indexedAt: string }[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query<{ path: string; chunks: number; indexedAt: string }>(
      `SELECT file_path as path, COUNT(*) as chunks, MAX(indexed_at) as "indexedAt"
       FROM documents
       GROUP BY file_path
       ORDER BY file_path`
    );

    return result.rows;
  }

  async getFileChunks(filePath: string): Promise<Document[]> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query<Document>(
      `SELECT id, file_path as "filePath", chunk_index as "chunkIndex",
              content, indexed_at as "indexedAt"
       FROM documents
       WHERE file_path = $1
       ORDER BY chunk_index`,
      [filePath]
    );

    return result.rows;
  }

  async getStats(): Promise<{ totalFiles: number; totalChunks: number }> {
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.query<{ totalFiles: string; totalChunks: string }>(
      `SELECT COUNT(DISTINCT file_path) as "totalFiles", COUNT(*) as "totalChunks"
       FROM documents`
    );

    return {
      totalFiles: parseInt(result.rows[0]?.totalFiles || '0'),
      totalChunks: parseInt(result.rows[0]?.totalChunks || '0'),
    };
  }

  async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}
