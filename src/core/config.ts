// Config Management
// Load and save ~/.sift/config.json

import { readFile, writeFile, mkdir } from 'node:fs/promises';
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
 * Save the config file
 */
export async function saveConfig(config: SiftConfig): Promise<void> {
  await ensureSiftDir();
  const configPath = getConfigPath();

  // Ensure directory exists
  const dir = dirname(configPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }

  await writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
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
