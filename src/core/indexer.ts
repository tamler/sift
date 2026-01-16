// Document Indexer
// Parses PDF, DOCX, TXT, MD files and chunks them for embedding

import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import mammoth from 'mammoth';
import { expandPath } from './config.js';

// Disable worker for Node.js environment
GlobalWorkerOptions.workerSrc = '';

export interface ChunkOptions {
  maxTokens: number;
  overlap: number;
}

export interface Chunk {
  content: string;
  index: number;
  file: string;
}

export interface IndexResult {
  file: string;
  chunks: Chunk[];
  error?: string;
}

// Supported file extensions
const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md']);

/**
 * Rough token count estimation.
 * GPT/Claude tokenizers average ~4 characters per token for English text.
 * This is a simple heuristic that works well enough for chunking.
 */
function estimateTokens(text: string): number {
  // Count words and punctuation separately for better estimation
  const words = text.split(/\s+/).filter(Boolean);
  return Math.ceil(words.length * 1.3); // ~1.3 tokens per word on average
}

/**
 * Split text into chunks respecting paragraph boundaries where possible.
 */
function chunkText(
  text: string,
  maxTokens: number,
  overlapTokens: number
): string[] {
  const chunks: string[] = [];

  // Normalize whitespace and split into paragraphs
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split(/\n\n+/);

  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    const paragraphTokens = estimateTokens(trimmed);

    // If a single paragraph is too large, split it by sentences
    if (paragraphTokens > maxTokens) {
      // Flush current chunk first
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n\n'));
        currentChunk = [];
        currentTokens = 0;
      }

      // Split large paragraph by sentences
      const sentences = trimmed.split(/(?<=[.!?])\s+/);
      let sentenceChunk: string[] = [];
      let sentenceTokens = 0;

      for (const sentence of sentences) {
        const sentTokens = estimateTokens(sentence);

        if (sentenceTokens + sentTokens > maxTokens && sentenceChunk.length > 0) {
          chunks.push(sentenceChunk.join(' '));
          // Keep overlap from end of previous chunk
          const overlapText = getOverlapText(sentenceChunk, overlapTokens);
          sentenceChunk = overlapText ? [overlapText] : [];
          sentenceTokens = overlapText ? estimateTokens(overlapText) : 0;
        }

        sentenceChunk.push(sentence);
        sentenceTokens += sentTokens;
      }

      if (sentenceChunk.length > 0) {
        currentChunk = sentenceChunk;
        currentTokens = sentenceTokens;
      }
      continue;
    }

    // Check if adding this paragraph would exceed the limit
    if (currentTokens + paragraphTokens > maxTokens && currentChunk.length > 0) {
      // Save current chunk
      chunks.push(currentChunk.join('\n\n'));

      // Start new chunk with overlap from the end of the previous
      const overlapText = getOverlapText(currentChunk, overlapTokens);
      currentChunk = overlapText ? [overlapText, trimmed] : [trimmed];
      currentTokens = (overlapText ? estimateTokens(overlapText) : 0) + paragraphTokens;
    } else {
      currentChunk.push(trimmed);
      currentTokens += paragraphTokens;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n\n'));
  }

  return chunks.filter((c) => c.trim().length > 0);
}

/**
 * Get overlap text from the end of chunks for continuity.
 */
function getOverlapText(chunks: string[], targetTokens: number): string {
  if (targetTokens <= 0) return '';

  const combined = chunks.join('\n\n');
  const words = combined.split(/\s+/);

  // Estimate how many words we need for the target tokens
  const targetWords = Math.ceil(targetTokens / 1.3);

  if (words.length <= targetWords) {
    return combined;
  }

  return words.slice(-targetWords).join(' ');
}

export class Indexer {
  private options: ChunkOptions;

  constructor(options: Partial<ChunkOptions> = {}) {
    this.options = {
      maxTokens: options.maxTokens ?? 500,
      overlap: options.overlap ?? 50,
    };
  }

  /**
   * Check if a file extension is supported
   */
  static isSupported(filePath: string): boolean {
    const ext = extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  /**
   * Get list of supported extensions
   */
  static getSupportedExtensions(): string[] {
    return Array.from(SUPPORTED_EXTENSIONS);
  }

  /**
   * Parse a file and extract its text content
   */
  async parseFile(filePath: string): Promise<string> {
    const absolutePath = resolve(expandPath(filePath));
    const ext = extname(absolutePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return this.parsePdf(absolutePath);
      case '.docx':
        return this.parseDocx(absolutePath);
      case '.txt':
      case '.md':
        return this.parseText(absolutePath);
      default:
        throw new Error(`Unsupported file type: ${ext}`);
    }
  }

  /**
   * Index a single file into chunks
   */
  async indexFile(filePath: string): Promise<Chunk[]> {
    const absolutePath = resolve(expandPath(filePath));

    // Parse the file to get text content
    const text = await this.parseFile(absolutePath);

    // Chunk the text
    const textChunks = chunkText(
      text,
      this.options.maxTokens,
      this.options.overlap
    );

    // Create Chunk objects
    return textChunks.map((content, index) => ({
      content,
      index,
      file: absolutePath,
    }));
  }

  /**
   * Index all supported files in a folder
   */
  async indexFolder(folderPath: string, recursive = true): Promise<Chunk[]> {
    const absolutePath = resolve(expandPath(folderPath));
    const results: Chunk[] = [];
    const errors: string[] = [];

    // Get all files in the folder
    const files = await this.walkFolder(absolutePath, recursive);

    // Filter to supported files
    const supportedFiles = files.filter((f) => Indexer.isSupported(f));

    // Index each file
    for (const file of supportedFiles) {
      try {
        const chunks = await this.indexFile(file);
        results.push(...chunks);
      } catch (error) {
        errors.push(`Failed to index ${file}: ${error}`);
      }
    }

    if (errors.length > 0) {
      console.error('Indexing errors:', errors.join('\n'));
    }

    return results;
  }

  /**
   * Index folder and return results with per-file status
   */
  async indexFolderWithResults(
    folderPath: string,
    recursive = true
  ): Promise<IndexResult[]> {
    const absolutePath = resolve(expandPath(folderPath));
    const results: IndexResult[] = [];

    // Get all files in the folder
    const files = await this.walkFolder(absolutePath, recursive);

    // Filter to supported files
    const supportedFiles = files.filter((f) => Indexer.isSupported(f));

    // Index each file
    for (const file of supportedFiles) {
      try {
        const chunks = await this.indexFile(file);
        results.push({ file, chunks });
      } catch (error) {
        results.push({
          file,
          chunks: [],
          error: String(error),
        });
      }
    }

    return results;
  }

  /**
   * Walk a folder and return all file paths
   */
  private async walkFolder(
    folderPath: string,
    recursive: boolean
  ): Promise<string[]> {
    const files: string[] = [];

    const entries = await readdir(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(folderPath, entry.name);

      // Skip hidden files and folders
      if (entry.name.startsWith('.')) continue;

      if (entry.isFile()) {
        files.push(fullPath);
      } else if (entry.isDirectory() && recursive) {
        const subFiles = await this.walkFolder(fullPath, recursive);
        files.push(...subFiles);
      }
    }

    return files;
  }

  /**
   * Parse PDF file using pdf.js
   */
  private async parsePdf(filePath: string): Promise<string> {
    const data = await readFile(filePath);
    const pdf = await getDocument({ data }).promise;

    const textParts: string[] = [];

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ');
      textParts.push(pageText);
    }

    return textParts.join('\n\n');
  }

  /**
   * Parse DOCX file using mammoth
   */
  private async parseDocx(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  /**
   * Parse plain text or markdown file
   */
  private async parseText(filePath: string): Promise<string> {
    return readFile(filePath, 'utf-8');
  }
}
