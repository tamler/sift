#!/usr/bin/env node
// Sift CLI
// Command-line interface for indexing and searching

import { parseArgs } from 'node:util';

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: 'boolean', short: 'h' },
    version: { type: 'boolean', short: 'v' },
  },
  allowPositionals: true,
});

const command = positionals[0];

if (values.help || !command) {
  console.log(`
Sift - Local RAG for Claude

Usage:
  sift <command> [options]

Commands:
  index <folder>   Index a folder
  search <query>   Search indexed documents
  list             List indexed files
  status           Show status

Options:
  -h, --help       Show this help
  -v, --version    Show version
`);
  process.exit(0);
}

if (values.version) {
  console.log('sift 0.1.0');
  process.exit(0);
}

// TODO: Implement commands
console.log(`Command '${command}' not yet implemented`);
