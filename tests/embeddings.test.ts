import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmbeddingsClient } from '../src/core/embeddings.js';

describe('EmbeddingsClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should use default config when no options provided', () => {
      const client = new EmbeddingsClient();
      const config = client.getConfig();

      expect(config.provider).toBe('ollama');
      expect(config.model).toBe('nomic-embed-text');
      expect(config.baseUrl).toBe('http://localhost:11434');
    });

    it('should accept custom configuration', () => {
      const client = new EmbeddingsClient({
        provider: 'ollama',
        model: 'mxbai-embed-large',
        baseUrl: 'http://custom:11434',
      });
      const config = client.getConfig();

      expect(config.model).toBe('mxbai-embed-large');
      expect(config.baseUrl).toBe('http://custom:11434');
    });
  });

  describe('embed (with mocked fetch)', () => {
    it('should call Ollama API correctly', async () => {
      const mockEmbedding = Array(384).fill(0.1);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const client = new EmbeddingsClient();
      const result = await client.embed('test text');

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/embeddings',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'nomic-embed-text',
            prompt: 'test text',
          }),
        })
      );

      expect(result).toEqual(mockEmbedding);
      expect(result.length).toBe(384);
    });

    it('should throw on API error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });

      const client = new EmbeddingsClient();

      await expect(client.embed('test')).rejects.toThrow(
        'Ollama embedding failed: 500'
      );
    });

    it('should throw on invalid response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ error: 'model not found' }),
      });

      const client = new EmbeddingsClient();

      await expect(client.embed('test')).rejects.toThrow(
        'Invalid response from Ollama'
      );
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts with concurrency control', async () => {
      const mockEmbedding = Array(384).fill(0.1);
      let callCount = 0;

      global.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ embedding: mockEmbedding }),
        });
      });

      const client = new EmbeddingsClient();
      const texts = Array(10).fill('test text');
      const results = await client.embedBatch(texts);

      expect(results.length).toBe(10);
      expect(callCount).toBe(10);
      results.forEach((result) => {
        expect(result.length).toBe(384);
      });
    });
  });

  describe('getDimension', () => {
    it('should detect dimension from first embedding call', async () => {
      const mockEmbedding = Array(1024).fill(0.1); // Larger model

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const client = new EmbeddingsClient();
      const dimension = await client.getDimension();

      expect(dimension).toBe(1024);
    });

    it('should cache dimension after first call', async () => {
      const mockEmbedding = Array(384).fill(0.1);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ embedding: mockEmbedding }),
      });

      const client = new EmbeddingsClient();

      const dim1 = await client.getDimension();
      const dim2 = await client.getDimension();

      expect(dim1).toBe(384);
      expect(dim2).toBe(384);
      // Second call should use cached value, not make another fetch
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('detectOllama', () => {
    it('should return true when Ollama is available', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await EmbeddingsClient.detectOllama();
      expect(result).toBe(true);
    });

    it('should return false when Ollama is not available', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

      const result = await EmbeddingsClient.detectOllama();
      expect(result).toBe(false);
    });

    it('should use custom base URL', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await EmbeddingsClient.detectOllama('http://custom:11434');

      expect(fetch).toHaveBeenCalledWith(
        'http://custom:11434/api/tags',
        expect.any(Object)
      );
    });
  });

  describe('listOllamaModels', () => {
    it('should return list of models', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: 'nomic-embed-text:latest' },
              { name: 'mxbai-embed-large:latest' },
            ],
          }),
      });

      const models = await EmbeddingsClient.listOllamaModels();

      expect(models).toContain('nomic-embed-text:latest');
      expect(models).toContain('mxbai-embed-large:latest');
    });

    it('should return empty array on error', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const models = await EmbeddingsClient.listOllamaModels();
      expect(models).toEqual([]);
    });
  });

  describe('hasModel', () => {
    it('should detect exact model match', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'nomic-embed-text' }],
          }),
      });

      const has = await EmbeddingsClient.hasModel('nomic-embed-text');
      expect(has).toBe(true);
    });

    it('should detect model with tag', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'nomic-embed-text:latest' }],
          }),
      });

      const has = await EmbeddingsClient.hasModel('nomic-embed-text');
      expect(has).toBe(true);
    });

    it('should return false when model not found', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [{ name: 'other-model' }],
          }),
      });

      const has = await EmbeddingsClient.hasModel('nomic-embed-text');
      expect(has).toBe(false);
    });
  });

  describe('Voyage/OpenAI (not implemented)', () => {
    it('should throw for Voyage provider', async () => {
      const client = new EmbeddingsClient({ provider: 'voyage' });
      await expect(client.embed('test')).rejects.toThrow('not yet implemented');
    });

    it('should throw for OpenAI provider', async () => {
      const client = new EmbeddingsClient({ provider: 'openai' });
      await expect(client.embed('test')).rejects.toThrow('not yet implemented');
    });
  });
});
