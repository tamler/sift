import { describe, it, expect, vi } from 'vitest';
import { search } from '../src/core/search.js';
import type { Database } from '../src/core/database.js';
import type { EmbeddingsClient } from '../src/core/embeddings.js';

describe('search', () => {
  describe('input validation', () => {
    const mockDb = {} as Database;
    const mockEmbeddings = {} as EmbeddingsClient;

    it('should reject empty query', async () => {
      await expect(search('', mockDb, mockEmbeddings)).rejects.toThrow(
        'Search query cannot be empty'
      );
    });

    it('should reject whitespace-only query', async () => {
      await expect(search('   ', mockDb, mockEmbeddings)).rejects.toThrow(
        'Search query cannot be empty'
      );
    });

    it('should reject null query', async () => {
      await expect(search(null as any, mockDb, mockEmbeddings)).rejects.toThrow(
        'Search query cannot be empty'
      );
    });

    it('should reject undefined query', async () => {
      await expect(search(undefined as any, mockDb, mockEmbeddings)).rejects.toThrow(
        'Search query cannot be empty'
      );
    });
  });

  describe('folder filtering', () => {
    it('should normalize and expand folder path for filtering', async () => {
      const mockResults = [
        {
          id: 1,
          filePath: '/home/user/Documents/test.txt',
          chunkIndex: 0,
          content: 'test content',
          embedding: [],
          indexedAt: new Date().toISOString(),
          score: 0.9,
        },
        {
          id: 2,
          filePath: '/home/user/Other/other.txt',
          chunkIndex: 0,
          content: 'other content',
          embedding: [],
          indexedAt: new Date().toISOString(),
          score: 0.8,
        },
      ];

      const mockDb = {
        search: vi.fn().mockResolvedValue(mockResults),
      } as unknown as Database;

      const mockEmbeddings = {
        embed: vi.fn().mockResolvedValue([0.1, 0.2, 0.3]),
      } as unknown as EmbeddingsClient;

      const results = await search('test', mockDb, mockEmbeddings, {
        folder: '/home/user/Documents',
      });

      // Should only return the result from Documents folder
      expect(results.length).toBe(1);
      expect(results[0].file).toBe('/home/user/Documents/test.txt');
    });
  });
});
