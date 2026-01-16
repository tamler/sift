// Embeddings Client
// Supports Ollama (local), Voyage AI, and OpenAI

export type EmbeddingProvider = 'ollama' | 'voyage' | 'openai';

export interface EmbeddingsConfig {
  provider: EmbeddingProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export class EmbeddingsClient {
  private config: EmbeddingsConfig;

  constructor(config: Partial<EmbeddingsConfig> = {}) {
    this.config = {
      provider: config.provider ?? 'ollama',
      model: config.model ?? 'nomic-embed-text',
      apiKey: config.apiKey,
      baseUrl: config.baseUrl ?? 'http://localhost:11434',
    };
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
    // TODO: Implement batch embedding for efficiency
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  private async embedOllama(text: string): Promise<number[]> {
    // TODO: Call Ollama API at localhost:11434
    throw new Error('Not implemented');
  }

  private async embedVoyage(text: string): Promise<number[]> {
    // TODO: Call Voyage AI API
    throw new Error('Not implemented');
  }

  private async embedOpenAI(text: string): Promise<number[]> {
    // TODO: Call OpenAI API
    throw new Error('Not implemented');
  }

  static async detectOllama(): Promise<boolean> {
    // TODO: Check if Ollama is running on localhost:11434
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      return response.ok;
    } catch {
      return false;
    }
  }
}
