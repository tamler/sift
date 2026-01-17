import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  loadConfig,
  saveConfig,
  updateConfig,
  addFolder,
  removeFolder,
  expandPath,
  getSiftDir,
  getConfigPath,
  type SiftConfig,
} from '../src/core/config.js';
import { rm, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

describe('Config', () => {
  const testSiftDir = join(homedir(), '.sift-test');
  const originalEnv = process.env.HOME;

  // We can't easily mock the home directory, so we'll test the expandPath function
  // and basic config operations

  describe('expandPath', () => {
    it('should expand ~ to home directory', () => {
      const expanded = expandPath('~/Documents');
      expect(expanded).toBe(join(homedir(), 'Documents'));
    });

    it('should leave absolute paths unchanged', () => {
      const path = '/usr/local/bin';
      expect(expandPath(path)).toBe(path);
    });

    it('should leave relative paths unchanged', () => {
      const path = './local/file.txt';
      expect(expandPath(path)).toBe(path);
    });
  });

  describe('getSiftDir', () => {
    it('should return path in home directory', () => {
      const siftDir = getSiftDir();
      expect(siftDir).toBe(join(homedir(), '.sift'));
    });
  });

  describe('getConfigPath', () => {
    it('should return config.json path', () => {
      const configPath = getConfigPath();
      expect(configPath).toBe(join(homedir(), '.sift', 'config.json'));
    });
  });

  describe('Config operations', () => {
    // Note: These tests will use the actual ~/.sift directory
    // In a production test suite, we'd want to mock the filesystem

    it('should return default config structure', async () => {
      const config = await loadConfig();

      expect(config).toHaveProperty('folders');
      expect(config).toHaveProperty('embeddings');
      expect(config).toHaveProperty('chunking');
      expect(config).toHaveProperty('database');

      expect(config.embeddings).toHaveProperty('provider');
      expect(config.embeddings).toHaveProperty('model');
      expect(config.chunking).toHaveProperty('maxTokens');
      expect(config.chunking).toHaveProperty('overlap');
    });

    it('should have valid default embedding config', async () => {
      const config = await loadConfig();

      expect(config.embeddings.provider).toBe('ollama');
      expect(config.embeddings.model).toBe('nomic-embed-text');
      expect(config.embeddings.baseUrl).toBe('http://localhost:11434');
    });

    it('should have valid default chunking config', async () => {
      const config = await loadConfig();

      expect(config.chunking.maxTokens).toBe(500);
      expect(config.chunking.overlap).toBe(50);
    });
  });

  describe('Config validation', () => {
    it('should reject invalid provider', async () => {
      const invalidConfig = {
        folders: [],
        embeddings: {
          provider: 'invalid' as any,
          model: 'test',
          baseUrl: 'http://localhost:11434',
        },
        chunking: { maxTokens: 500, overlap: 50 },
        database: '~/.sift/sift.db',
      };

      await expect(saveConfig(invalidConfig)).rejects.toThrow('Invalid embedding provider');
    });

    it('should reject empty model', async () => {
      const invalidConfig = {
        folders: [],
        embeddings: {
          provider: 'ollama' as const,
          model: '',
          baseUrl: 'http://localhost:11434',
        },
        chunking: { maxTokens: 500, overlap: 50 },
        database: '~/.sift/sift.db',
      };

      await expect(saveConfig(invalidConfig)).rejects.toThrow('non-empty string');
    });

    it('should reject invalid baseUrl', async () => {
      const invalidConfig = {
        folders: [],
        embeddings: {
          provider: 'ollama' as const,
          model: 'test',
          baseUrl: 'not-a-url',
        },
        chunking: { maxTokens: 500, overlap: 50 },
        database: '~/.sift/sift.db',
      };

      await expect(saveConfig(invalidConfig)).rejects.toThrow('Invalid embedding base URL');
    });

    it('should reject invalid maxTokens', async () => {
      const invalidConfig = {
        folders: [],
        embeddings: {
          provider: 'ollama' as const,
          model: 'test',
          baseUrl: 'http://localhost:11434',
        },
        chunking: { maxTokens: 10, overlap: 5 }, // Too small
        database: '~/.sift/sift.db',
      };

      await expect(saveConfig(invalidConfig)).rejects.toThrow('Invalid maxTokens');
    });

    it('should reject overlap >= maxTokens', async () => {
      const invalidConfig = {
        folders: [],
        embeddings: {
          provider: 'ollama' as const,
          model: 'test',
          baseUrl: 'http://localhost:11434',
        },
        chunking: { maxTokens: 500, overlap: 500 }, // Equal
        database: '~/.sift/sift.db',
      };

      await expect(saveConfig(invalidConfig)).rejects.toThrow('Overlap must be less than maxTokens');
    });
  });
});
