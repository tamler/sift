// Config Management
// Load and save ~/.sift/config.json

import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import type { EmbeddingProvider } from './embeddings.js';

export interface SiftConfig {
  folders: string[];
  embeddings: {
    provider: EmbeddingProvider;
    model: string;
    baseUrl?: string;
    apiKey?: string;
    dimension?: number; // Cached after first embedding call
  };
  chunking: {
    maxTokens: number;
    overlap: number;
  };
  database: string;
}

// Validation constants
const MIN_MAX_TOKENS = 50;
const MAX_MAX_TOKENS = 10000;
const MIN_OVERLAP = 0;
const MAX_OVERLAP = 500;
const VALID_PROVIDERS: EmbeddingProvider[] = ['ollama', 'voyage', 'openai'];

/**
 * Validate a URL string
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate config values and throw on invalid input
 */
function validateConfig(config: SiftConfig): void {
  // Validate provider
  if (!VALID_PROVIDERS.includes(config.embeddings.provider)) {
    throw new Error(
      `Invalid embedding provider: ${config.embeddings.provider}. ` +
      `Must be one of: ${VALID_PROVIDERS.join(', ')}`
    );
  }

  // Validate model (non-empty string)
  if (!config.embeddings.model || typeof config.embeddings.model !== 'string') {
    throw new Error('Embedding model must be a non-empty string');
  }

  // Validate baseUrl if provided
  if (config.embeddings.baseUrl && !isValidUrl(config.embeddings.baseUrl)) {
    throw new Error(`Invalid embedding base URL: ${config.embeddings.baseUrl}`);
  }

  // Validate dimension if provided
  if (config.embeddings.dimension !== undefined) {
    if (
      typeof config.embeddings.dimension !== 'number' ||
      !Number.isInteger(config.embeddings.dimension) ||
      config.embeddings.dimension < 1 ||
      config.embeddings.dimension > 8192
    ) {
      throw new Error(
        `Invalid embedding dimension: ${config.embeddings.dimension}. ` +
        'Must be an integer between 1 and 8192.'
      );
    }
  }

  // Validate chunking
  if (
    typeof config.chunking.maxTokens !== 'number' ||
    config.chunking.maxTokens < MIN_MAX_TOKENS ||
    config.chunking.maxTokens > MAX_MAX_TOKENS
  ) {
    throw new Error(
      `Invalid maxTokens: ${config.chunking.maxTokens}. ` +
      `Must be between ${MIN_MAX_TOKENS} and ${MAX_MAX_TOKENS}.`
    );
  }

  if (
    typeof config.chunking.overlap !== 'number' ||
    config.chunking.overlap < MIN_OVERLAP ||
    config.chunking.overlap > MAX_OVERLAP
  ) {
    throw new Error(
      `Invalid overlap: ${config.chunking.overlap}. ` +
      `Must be between ${MIN_OVERLAP} and ${MAX_OVERLAP}.`
    );
  }

  if (config.chunking.overlap >= config.chunking.maxTokens) {
    throw new Error('Overlap must be less than maxTokens');
  }
}

const DEFAULT_CONFIG: SiftConfig = {
  folders: [],
  embeddings: {
    provider: 'ollama',
    model: 'nomic-embed-text',
    baseUrl: 'http://localhost:11434',
  },
  chunking: {
    maxTokens: 500,
    overlap: 50,
  },
  database: '~/.sift/sift.db',
};

/**
 * Get the path to the Sift config directory
 */
export function getSiftDir(): string {
  return join(homedir(), '.sift');
}

/**
 * Get the path to the config file
 */
export function getConfigPath(): string {
  return join(getSiftDir(), 'config.json');
}

/**
 * Expand ~ to home directory in paths
 */
export function expandPath(path: string): string {
  if (path.startsWith('~')) {
    return join(homedir(), path.slice(1));
  }
  return path;
}

/**
 * Ensure the .sift directory exists
 */
export async function ensureSiftDir(): Promise<void> {
  const dir = getSiftDir();
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

/**
 * Load the config file, creating default if it doesn't exist
 */
export async function loadConfig(): Promise<SiftConfig> {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    // Create default config
    await ensureSiftDir();
    await saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = await readFile(configPath, 'utf-8');
    const loaded = JSON.parse(content) as Partial<SiftConfig>;

    // Merge with defaults to ensure all fields exist
    return {
      folders: loaded.folders ?? DEFAULT_CONFIG.folders,
      embeddings: {
        ...DEFAULT_CONFIG.embeddings,
        ...loaded.embeddings,
      },
      chunking: {
        ...DEFAULT_CONFIG.chunking,
        ...loaded.chunking,
      },
      database: loaded.database ?? DEFAULT_CONFIG.database,
    };
  } catch (error) {
    console.error(`Failed to load config: ${error}`);
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Save the config file with restrictive permissions (may contain API keys)
 */
export async function saveConfig(config: SiftConfig): Promise<void> {
  // Validate before saving
  validateConfig(config);

  await ensureSiftDir();
  const configPath = getConfigPath();

  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

  // Set restrictive permissions (owner read/write only) since config may contain API keys
  try {
    await chmod(configPath, 0o600);
  } catch {
    // chmod may fail on some systems (e.g., Windows), that's acceptable
  }
}

/**
 * Update specific config values
 */
export async function updateConfig(
  updates: Partial<SiftConfig>
): Promise<SiftConfig> {
  const current = await loadConfig();

  const updated: SiftConfig = {
    ...current,
    ...updates,
    embeddings: {
      ...current.embeddings,
      ...(updates.embeddings ?? {}),
    },
    chunking: {
      ...current.chunking,
      ...(updates.chunking ?? {}),
    },
  };

  await saveConfig(updated);
  return updated;
}

/**
 * Add a folder to the indexed folders list
 */
export async function addFolder(folder: string): Promise<SiftConfig> {
  const config = await loadConfig();
  const expandedFolder = expandPath(folder);

  if (!config.folders.includes(expandedFolder)) {
    config.folders.push(expandedFolder);
    await saveConfig(config);
  }

  return config;
}

/**
 * Remove a folder from the indexed folders list
 */
export async function removeFolder(folder: string): Promise<SiftConfig> {
  const config = await loadConfig();
  const expandedFolder = expandPath(folder);

  config.folders = config.folders.filter((f) => f !== expandedFolder);
  await saveConfig(config);

  return config;
}
