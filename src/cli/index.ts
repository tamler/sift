#!/usr/bin/env node
// Sift CLI
// Command-line interface for indexing and searching

import { parseArgs } from 'node:util';
import { createInterface } from 'node:readline';
import { Database } from '../core/database.js';
import { EmbeddingsClient } from '../core/embeddings.js';
import { Indexer } from '../core/indexer.js';
import { search } from '../core/search.js';
import {
  loadConfig,
  updateConfig,
  addFolder,
  expandPath,
  type SiftConfig,
} from '../core/config.js';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
    limit: { type: 'string', short: 'l' },
    recursive: { type: 'boolean', short: 'r', default: true },
    folder: { type: 'string', short: 'f' },
    stats: { type: 'boolean', short: 's' },
  },
  allowPositionals: true,
});

const command = positionals[0];

const HELP_TEXT = `
Sift - Local RAG for Claude

Usage:
  sift <command> [options]

Commands:
  setup            Interactive setup for embedding configuration
  index <folder>   Index a folder for semantic search
  search <query>   Search indexed documents
  list             List indexed files
  status           Show configuration and status
  config           Show current configuration

Options:
  -h, --help       Show this help
  -v, --version    Show version
  -l, --limit <n>  Limit number of results (search)
  -r, --recursive  Include subfolders (index, default: true)
  -f, --folder     Filter to specific folder (search, list)
  -s, --stats      Include statistics (list)

Examples:
  sift setup                           # Configure embeddings
  sift index ~/Documents/research      # Index a folder
  sift search "machine learning"       # Search documents
  sift list --stats                    # List indexed files
`;

async function initializeServices(config: SiftConfig) {
  // Create embeddings client
  const embeddings = new EmbeddingsClient({
    provider: config.embeddings.provider,
    model: config.embeddings.model,
    baseUrl: config.embeddings.baseUrl,
    apiKey: config.embeddings.apiKey,
  });

  // Get dimension (makes test call if needed)
  let dimension = config.embeddings.dimension;
  if (!dimension) {
    dimension = await embeddings.getDimension();
    await updateConfig({
      embeddings: { ...config.embeddings, dimension },
    });
  }

  // Initialize database
  const db = new Database(expandPath(config.database), dimension);
  await db.init();

  return { db, embeddings, dimension };
}

async function cmdIndex(folder: string, recursive: boolean) {
  if (!folder) {
    console.error('Error: Please specify a folder to index');
    console.error('Usage: sift index <folder>');
    process.exit(1);
  }

  const expandedFolder = expandPath(folder);
  console.log(`Indexing ${expandedFolder}${recursive ? ' (recursive)' : ''}...`);

  const config = await loadConfig();

  // Check Ollama availability
  if (config.embeddings.provider === 'ollama') {
    const available = await EmbeddingsClient.detectOllama(config.embeddings.baseUrl);
    if (!available) {
      console.error(
        `Error: Ollama not available at ${config.embeddings.baseUrl}`
      );
      console.error(
        `Make sure Ollama is running and the model '${config.embeddings.model}' is pulled.`
      );
      console.error('  ollama pull ' + config.embeddings.model);
      process.exit(1);
    }
  }

  const { db, embeddings } = await initializeServices(config);

  const indexer = new Indexer({
    maxTokens: config.chunking.maxTokens,
    overlap: config.chunking.overlap,
  });

  try {
    const results = await indexer.indexFolderWithResults(expandedFolder, recursive);

    let totalFiles = 0;
    let totalChunks = 0;
    let errors = 0;

    for (const result of results) {
      if (result.error) {
        console.error(`  Error: ${result.file} - ${result.error}`);
        errors++;
        continue;
      }

      console.log(`  Processing ${result.file}...`);

      for (const chunk of result.chunks) {
        try {
          const embedding = await embeddings.embed(chunk.content);
          await db.insert({
            filePath: chunk.file,
            chunkIndex: chunk.index,
            content: chunk.content,
            embedding,
          });
          totalChunks++;
        } catch (error) {
          console.error(`    Chunk ${chunk.index} failed: ${error}`);
        }
      }

      totalFiles++;
    }

    // Save folder to config
    if (totalFiles > 0) {
      await addFolder(expandedFolder);
    }

    console.log(`\nDone! Indexed ${totalFiles} files, ${totalChunks} chunks.`);
    if (errors > 0) {
      console.log(`  ${errors} files had errors.`);
    }
  } finally {
    await db.close();
  }
}

async function cmdSearch(query: string, limit: number, folder?: string) {
  if (!query) {
    console.error('Error: Please specify a search query');
    console.error('Usage: sift search <query>');
    process.exit(1);
  }

  const config = await loadConfig();
  const { db, embeddings } = await initializeServices(config);

  try {
    const results = await search(query, db, embeddings, { limit, folder });

    if (results.length === 0) {
      console.log('No results found.');
      return;
    }

    console.log(`Found ${results.length} results:\n`);

    for (const result of results) {
      const score = (result.score * 100).toFixed(1);
      console.log(`[${score}%] ${result.file}`);
      console.log('─'.repeat(60));

      // Show a preview of the content (first 200 chars)
      const preview = result.content.slice(0, 300).replace(/\n+/g, ' ');
      console.log(preview + (result.content.length > 300 ? '...' : ''));
      console.log('');
    }
  } finally {
    await db.close();
  }
}

async function cmdList(folder?: string, showStats?: boolean) {
  const config = await loadConfig();
  const { db } = await initializeServices(config);

  try {
    let files = await db.listFiles();

    if (folder) {
      const expandedFolder = expandPath(folder);
      files = files.filter((f) => f.path.startsWith(expandedFolder));
    }

    if (files.length === 0) {
      console.log('No indexed files found.');
      return;
    }

    const stats = await db.getStats();

    console.log(`Indexed files: ${stats.totalFiles}`);
    console.log(`Total chunks: ${stats.totalChunks}\n`);

    for (const file of files) {
      if (showStats) {
        console.log(`  ${file.path} (${file.chunks} chunks)`);
      } else {
        console.log(`  ${file.path}`);
      }
    }
  } finally {
    await db.close();
  }
}

async function cmdStatus() {
  const config = await loadConfig();

  console.log('Sift Configuration\n');
  console.log(`Database: ${expandPath(config.database)}`);
  console.log(`\nEmbeddings:`);
  console.log(`  Provider: ${config.embeddings.provider}`);
  console.log(`  Model: ${config.embeddings.model}`);
  console.log(`  Base URL: ${config.embeddings.baseUrl || 'default'}`);
  if (config.embeddings.dimension) {
    console.log(`  Dimension: ${config.embeddings.dimension}`);
  }

  if (config.embeddings.provider === 'ollama') {
    const available = await EmbeddingsClient.detectOllama(config.embeddings.baseUrl);
    console.log(`  Ollama available: ${available ? 'yes' : 'no'}`);

    if (available) {
      const models = await EmbeddingsClient.listOllamaModels(config.embeddings.baseUrl);
      const hasModel = models.some(
        (m) => m === config.embeddings.model || m.startsWith(`${config.embeddings.model}:`)
      );
      console.log(`  Model installed: ${hasModel ? 'yes' : 'no'}`);
    }
  }

  console.log(`\nChunking:`);
  console.log(`  Max tokens: ${config.chunking.maxTokens}`);
  console.log(`  Overlap: ${config.chunking.overlap}`);

  console.log(`\nConfigured folders:`);
  if (config.folders.length === 0) {
    console.log('  (none)');
  } else {
    for (const folder of config.folders) {
      console.log(`  ${folder}`);
    }
  }

  // Show database stats if initialized
  try {
    const dimension = config.embeddings.dimension || 384;
    const db = new Database(expandPath(config.database), dimension);
    await db.init();
    const stats = await db.getStats();
    await db.close();

    console.log(`\nDatabase stats:`);
    console.log(`  Files: ${stats.totalFiles}`);
    console.log(`  Chunks: ${stats.totalChunks}`);
  } catch {
    console.log(`\nDatabase: not initialized`);
  }
}

/**
 * Prompt user for input with a default value
 */
function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const displayQuestion = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  return new Promise((resolve) => {
    rl.question(displayQuestion, (answer) => {
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

/**
 * Prompt user to select from a list of options
 */
function promptSelect(
  rl: ReturnType<typeof createInterface>,
  question: string,
  options: string[],
  defaultIndex = 0
): Promise<string> {
  return new Promise((resolve) => {
    console.log(`\n${question}`);
    options.forEach((opt, i) => {
      const marker = i === defaultIndex ? '>' : ' ';
      console.log(`  ${marker} ${i + 1}. ${opt}`);
    });
    rl.question(`\nEnter number [${defaultIndex + 1}]: `, (answer) => {
      const index = answer.trim() ? parseInt(answer.trim(), 10) - 1 : defaultIndex;
      if (index >= 0 && index < options.length) {
        resolve(options[index]);
      } else {
        resolve(options[defaultIndex]);
      }
    });
  });
}

/**
 * Interactive setup command
 */
async function cmdSetup() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║         Sift Setup Wizard              ║');
    console.log('║   Local RAG for Claude                 ║');
    console.log('╚════════════════════════════════════════╝\n');

    // Load existing config
    const config = await loadConfig();

    // Step 1: Ollama URL
    console.log('Step 1: Ollama Connection\n');
    const baseUrl = await prompt(
      rl,
      'Ollama base URL',
      config.embeddings.baseUrl || 'http://localhost:11434'
    );

    // Test connection
    console.log(`\nTesting connection to ${baseUrl}...`);
    const connected = await EmbeddingsClient.detectOllama(baseUrl);

    if (!connected) {
      console.log('\n⚠ Could not connect to Ollama.');
      console.log('  Make sure Ollama is running: ollama serve\n');
      const continueAnyway = await prompt(rl, 'Continue with setup anyway? (y/n)', 'n');
      if (continueAnyway.toLowerCase() !== 'y') {
        console.log('\nSetup cancelled. Run "sift setup" again when Ollama is running.');
        return;
      }
    } else {
      console.log('✓ Connected to Ollama\n');
    }

    // Step 2: Select model
    console.log('Step 2: Select Embedding Model\n');

    let model = config.embeddings.model || 'nomic-embed-text';
    let availableModels: string[] = [];

    if (connected) {
      availableModels = await EmbeddingsClient.listOllamaModels(baseUrl);
      // Filter to likely embedding models (common naming patterns)
      const embeddingModels = availableModels.filter(
        (m) =>
          m.includes('embed') ||
          m.includes('minilm') ||
          m.includes('bge') ||
          m.includes('e5') ||
          m.includes('gte')
      );

      if (embeddingModels.length > 0) {
        console.log('Found embedding models:');
        model = await promptSelect(rl, 'Select a model:', embeddingModels, 0);
      } else if (availableModels.length > 0) {
        console.log('No dedicated embedding models found.');
        console.log('Available models (may not all be suitable for embeddings):');
        model = await promptSelect(rl, 'Select a model:', availableModels, 0);
      } else {
        console.log('No models found. You need to pull an embedding model first.');
        console.log('\nRecommended embedding models:');
        console.log('  ollama pull nomic-embed-text    (384 dimensions, fast)');
        console.log('  ollama pull mxbai-embed-large   (1024 dimensions, better quality)');
        console.log('  ollama pull all-minilm          (384 dimensions, smallest)\n');
        model = await prompt(rl, 'Enter model name to use', 'nomic-embed-text');
      }
    } else {
      console.log('Cannot list models (Ollama not connected).');
      console.log('\nRecommended embedding models:');
      console.log('  nomic-embed-text    (384 dimensions, fast)');
      console.log('  mxbai-embed-large   (1024 dimensions, better quality)');
      console.log('  all-minilm          (384 dimensions, smallest)\n');
      model = await prompt(rl, 'Enter model name to use', model);
    }

    // Remove tag if present for cleaner display
    const modelBase = model.split(':')[0];
    console.log(`\nSelected model: ${modelBase}`);

    // Step 3: Test embedding and detect dimension
    console.log('\nStep 3: Testing Embedding\n');

    let dimension: number | undefined;

    if (connected) {
      console.log('Making test embedding to detect dimensions...');
      try {
        const testClient = new EmbeddingsClient({
          provider: 'ollama',
          model: modelBase,
          baseUrl,
        });
        dimension = await testClient.getDimension();
        console.log(`✓ Model works! Embedding dimension: ${dimension}`);
      } catch (error) {
        console.log(`\n⚠ Could not create test embedding: ${error}`);
        console.log('  The model may need to be pulled first:');
        console.log(`  ollama pull ${modelBase}\n`);
        const saveAnyway = await prompt(rl, 'Save configuration anyway? (y/n)', 'y');
        if (saveAnyway.toLowerCase() !== 'y') {
          console.log('\nSetup cancelled.');
          return;
        }
      }
    }

    // Step 4: Save configuration
    console.log('\nStep 4: Saving Configuration\n');

    const newConfig = {
      ...config,
      embeddings: {
        ...config.embeddings,
        provider: 'ollama' as const,
        model: modelBase,
        baseUrl,
        dimension,
      },
    };

    await updateConfig(newConfig);
    console.log('✓ Configuration saved to ~/.sift/config.json');

    // Summary
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║           Setup Complete!              ║');
    console.log('╚════════════════════════════════════════╝');
    console.log('\nConfiguration:');
    console.log(`  Ollama URL: ${baseUrl}`);
    console.log(`  Model: ${modelBase}`);
    if (dimension) {
      console.log(`  Dimension: ${dimension}`);
    }
    console.log('\nNext steps:');
    console.log('  1. Index your documents:');
    console.log('     sift index ~/Documents\n');
    console.log('  2. Search with Claude or the CLI:');
    console.log('     sift search "your query"\n');
  } finally {
    rl.close();
  }
}

async function main() {
  if (values.help || !command) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (values.version) {
    console.log('sift 0.1.0');
    process.exit(0);
  }

  try {
    switch (command) {
      case 'setup':
        await cmdSetup();
        break;

      case 'index':
        await cmdIndex(
          positionals[1],
          values.recursive !== false
        );
        break;

      case 'search':
        await cmdSearch(
          positionals.slice(1).join(' '),
          values.limit ? parseInt(values.limit, 10) : 10,
          values.folder
        );
        break;

      case 'list':
        await cmdList(values.folder, values.stats);
        break;

      case 'status':
        await cmdStatus();
        break;

      case 'config':
        const config = await loadConfig();
        console.log(JSON.stringify(config, null, 2));
        break;

      default:
        console.error(`Unknown command: ${command}`);
        console.log(HELP_TEXT);
        process.exit(1);
    }
  } catch (error) {
    console.error(`Error: ${error}`);
    process.exit(1);
  }
}

main();
