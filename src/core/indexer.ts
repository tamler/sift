// Document Indexer
// Parses PDF, DOCX, TXT, MD files and chunks them for embedding

export interface ChunkOptions {
  maxTokens: number;
  overlap: number;
}

export interface Chunk {
  content: string;
  index: number;
  file: string;
}

export class Indexer {
  private options: ChunkOptions;

  constructor(options: Partial<ChunkOptions> = {}) {
    this.options = {
      maxTokens: options.maxTokens ?? 500,
      overlap: options.overlap ?? 50,
    };
  }

  async indexFile(filePath: string): Promise<Chunk[]> {
    // TODO: Implement file parsing based on extension
    // - .pdf -> pdf.js
    // - .docx -> mammoth.js
    // - .txt, .md -> native
    throw new Error('Not implemented');
  }

  async indexFolder(folderPath: string, recursive = true): Promise<Chunk[]> {
    // TODO: Walk folder and index each supported file
    throw new Error('Not implemented');
  }
}
