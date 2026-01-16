import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Indexer } from '../src/core/indexer.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Indexer', () => {
  let testDir: string;

  beforeAll(async () => {
    // Create a temporary test directory
    testDir = join(tmpdir(), `sift-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('isSupported', () => {
    it('should recognize PDF files', () => {
      expect(Indexer.isSupported('document.pdf')).toBe(true);
      expect(Indexer.isSupported('Document.PDF')).toBe(true);
    });

    it('should recognize DOCX files', () => {
      expect(Indexer.isSupported('document.docx')).toBe(true);
    });

    it('should recognize text files', () => {
      expect(Indexer.isSupported('document.txt')).toBe(true);
      expect(Indexer.isSupported('README.md')).toBe(true);
    });

    it('should reject unsupported files', () => {
      expect(Indexer.isSupported('image.png')).toBe(false);
      expect(Indexer.isSupported('script.js')).toBe(false);
      expect(Indexer.isSupported('data.json')).toBe(false);
    });
  });

  describe('getSupportedExtensions', () => {
    it('should return all supported extensions', () => {
      const extensions = Indexer.getSupportedExtensions();
      expect(extensions).toContain('.pdf');
      expect(extensions).toContain('.docx');
      expect(extensions).toContain('.txt');
      expect(extensions).toContain('.md');
    });
  });

  describe('indexFile', () => {
    it('should chunk a text file correctly', async () => {
      // Create a test file with multiple paragraphs
      const testContent = `
This is the first paragraph with some content about machine learning.
It contains multiple sentences to make it more realistic.

This is the second paragraph discussing neural networks.
Neural networks are composed of layers of interconnected nodes.

This is the third paragraph about data science.
Data science involves extracting insights from data using various techniques.
      `.trim();

      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, testContent);

      const indexer = new Indexer({ maxTokens: 50, overlap: 10 });
      const chunks = await indexer.indexFile(testFile);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].file).toBe(testFile);
      expect(chunks[0].index).toBe(0);
      expect(chunks[0].content.length).toBeGreaterThan(0);
    });

    it('should handle markdown files', async () => {
      const testContent = `
# Heading

This is some markdown content.

## Subheading

- List item 1
- List item 2
      `.trim();

      const testFile = join(testDir, 'test.md');
      await writeFile(testFile, testContent);

      const indexer = new Indexer();
      const chunks = await indexer.indexFile(testFile);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].content).toContain('Heading');
    });

    it('should create chunks with proper indices', async () => {
      // Create a long file that will be split into multiple chunks
      const paragraphs = Array(20).fill(
        'This is a test paragraph with enough content to test the chunking mechanism. It should be split across multiple chunks when the content exceeds the token limit.'
      );
      const testContent = paragraphs.join('\n\n');

      const testFile = join(testDir, 'long.txt');
      await writeFile(testFile, testContent);

      const indexer = new Indexer({ maxTokens: 100, overlap: 20 });
      const chunks = await indexer.indexFile(testFile);

      expect(chunks.length).toBeGreaterThan(1);

      // Check that indices are sequential
      for (let i = 0; i < chunks.length; i++) {
        expect(chunks[i].index).toBe(i);
      }
    });
  });

  describe('indexFolder', () => {
    it('should index all supported files in a folder', async () => {
      // Create a clean subdirectory for this test
      const folderTestDir = join(testDir, 'folder-test');
      await mkdir(folderTestDir, { recursive: true });

      // Create test files
      await writeFile(join(folderTestDir, 'doc1.txt'), 'Content of document 1');
      await writeFile(join(folderTestDir, 'doc2.md'), 'Content of document 2');
      await writeFile(join(folderTestDir, 'ignored.json'), '{"key": "value"}');

      const indexer = new Indexer();
      const chunks = await indexer.indexFolder(folderTestDir, false);

      // Should have chunks from txt and md files, but not json
      const files = [...new Set(chunks.map(c => c.file))];
      expect(files.length).toBe(2);
      expect(files.some(f => f.endsWith('.txt'))).toBe(true);
      expect(files.some(f => f.endsWith('.md'))).toBe(true);
      expect(files.some(f => f.endsWith('.json'))).toBe(false);
    });

    it('should handle recursive indexing', async () => {
      // Create a clean subdirectory for this test
      const recursiveTestDir = join(testDir, 'recursive-test');
      await mkdir(recursiveTestDir, { recursive: true });
      await writeFile(join(recursiveTestDir, 'top.txt'), 'Top level content');

      const subDir = join(recursiveTestDir, 'subdir');
      await mkdir(subDir, { recursive: true });
      await writeFile(join(subDir, 'nested.txt'), 'Nested content');

      const indexer = new Indexer();

      // Non-recursive should not include subdirectory
      const chunksNonRecursive = await indexer.indexFolder(recursiveTestDir, false);
      const filesNonRecursive = [...new Set(chunksNonRecursive.map(c => c.file))];
      expect(filesNonRecursive.some(f => f.includes('nested'))).toBe(false);

      // Recursive should include subdirectory
      const chunksRecursive = await indexer.indexFolder(recursiveTestDir, true);
      const filesRecursive = [...new Set(chunksRecursive.map(c => c.file))];
      expect(filesRecursive.some(f => f.includes('nested'))).toBe(true);
    });

    it('should skip hidden files and folders', async () => {
      // Create a clean subdirectory for this test
      const hiddenTestDir = join(testDir, 'hidden-test');
      await mkdir(hiddenTestDir, { recursive: true });
      await writeFile(join(hiddenTestDir, 'visible.txt'), 'Visible content');
      await writeFile(join(hiddenTestDir, '.hidden.txt'), 'Hidden content');

      const hiddenDir = join(hiddenTestDir, '.hidden-dir');
      await mkdir(hiddenDir, { recursive: true });
      await writeFile(join(hiddenDir, 'inside.txt'), 'Inside hidden dir');

      const indexer = new Indexer();
      const chunks = await indexer.indexFolder(hiddenTestDir, true);
      const files = [...new Set(chunks.map(c => c.file))];

      expect(files.some(f => f.includes('.hidden'))).toBe(false);
      expect(files.some(f => f.includes('visible'))).toBe(true);
    });
  });
});
