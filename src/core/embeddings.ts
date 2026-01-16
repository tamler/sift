// Embeddings Client
// Supports Ollama (local) - Voyage/OpenAI can be added later

export type EmbeddingProvider = 'ollama' | 'voyage' | 'openai';

export interface EmbeddingsConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

interface OllamaEmbeddingResponse {
  embedding: number[];
}

export class EmbeddingsClient {
  private config: EmbeddingsConfig;
  private dimension: number | null = null;

  constructor(config: Partial<EmbeddingsConfig> = {}) {
    this.config = {
      provider: config.provider ?? 'ollama',
      model: config.model ?? 'nomic-embed-text',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'http://localhost:11434',
    };
  }

  /**
   * Get the embedding dimension for the configured model.
   * Makes a test embedding call if dimension is not yet known.
   */
  async getDimension(): Promise<number> {
    if (this.dimension !== null) {
      return this.dimension;
    }

    // Make a test embedding to detect dimension
    const testEmbedding = await this.embed('test');
    this.dimension = testEmbedding.length;
    return this.dimension;
  }

  async embed(text: string): Promise<number[]> {
    switch (this.config.provider) {
      case 'ollama':
        return this.embedOllama(text);
      case 'voyage':
        return this.embedVoyage(text);
      case 'openai':
        return this.embedOpenAI(text);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Ollama doesn't have native batch support, so we parallelize
    // with a concurrency limit to avoid overwhelming the server
    const CONCURRENCY = 5;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const batch = texts.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(batch.map((t) => this.embed(t)));
      results.push(...batchResults);
    }

    return results;
  }

  private async embedOllama(text: string): Promise<number[]> {
    const url = `${this.config.baseUrl}/api/embeddings`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama embedding failed: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as OllamaEmbeddingResponse;

    if (!data.embedding || !Array.isArray(data.embedding)) {
      throw new Error('Invalid response from Ollama: missing embedding array');
    }

    // Cache the dimension on first successful call
    if (this.dimension === null) {
      this.dimension = data.embedding.length;
    }

    return data.embedding;
  }

  private async embedVoyage(_text: string): Promise<number[]> {
    // Voyage AI support can be added in v0.2
    throw new Error('Voyage AI embeddings not yet implemented. Use Ollama for now.');
  }

  private async embedOpenAI(_text: string): Promise<number[]> {
    // OpenAI support can be added in v0.2
    throw new Error('OpenAI embeddings not yet implemented. Use Ollama for now.');
  }

  /**
   * Check if Ollama is running and accessible
   */
  static async detectOllama(baseUrl = 'http://localhost:11434'): Promise<boolean> {
    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models from Ollama
   */
  static async listOllamaModels(baseUrl = 'http://localhost:11434'): Promise<string[]> {
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) return [];

      const data = (await response.json()) as { models?: Array<{ name: string }> };
      return data.models?.map((m) => m.name) ?? [];
    } catch {
      return [];
    }
  }

  /**
   * Check if a specific model is available in Ollama
   */
  static async hasModel(model: string, baseUrl = 'http://localhost:11434'): Promise<boolean> {
    const models = await EmbeddingsClient.listOllamaModels(baseUrl);
    return models.some((m) => m === model || m.startsWith(`${model}:`));
  }

  getConfig(): EmbeddingsConfig {
    return { ...this.config };
  }
}
