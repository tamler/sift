# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Sift** is an open source local RAG tool that gives Claude (Desktop, Cowork, and Code) semantic search over your documents. It indexes local folders and exposes search via MCP, letting Claude answer questions using your files as context.

**Repository:** github.com/tamler/sift
**License:** MIT

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           SIFT                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   Local Documents (any folder)                                  │
│         |                                                       │
│         v                                                       │
│   Indexer (PDF.js, mammoth.js)                                  │
│         |                                                       │
│         v                                                       │
│   Embeddings                                                    │
│     • Ollama (preferred, local, free)                           │
│     • Voyage/OpenAI API (fallback)                              │
│         |                                                       │
│         v                                                       │
│   PGLite Database (~/.sift/sift.db)                             │
│         |                                                       │
│         v                                                       │
│   MCP Server                                                    │
│         |                                                       │
│         v                                                       │
│   Claude Desktop / Cowork / Claude Code                         │
│     (searches via MCP, synthesizes answers)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Key insight:** Claude is the LLM. Sift just finds relevant chunks. No external LLM API needed.

## Project Structure

```
sift/
├── core/                 # Shared library
│   ├── indexer.ts        # Document parsing + chunking
│   ├── embeddings.ts     # Ollama / Voyage / OpenAI client
│   ├── database.ts       # PGLite + pgvector
│   └── search.ts         # Vector similarity search
├── mcp/                  # MCP server
│   ├── server.ts         # MCP protocol handler
│   └── tools.ts          # Tool implementations
├── extension/            # Desktop Extension packaging
│   ├── manifest.json
│   └── sift.mcpb
├── cli/                  # Optional CLI
│   └── index.ts
├── docs/
│   └── PRD.md            # Product spec
└── package.json
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `sift_search` | Semantic search across indexed documents |
| `sift_list` | List indexed files and folders |
| `sift_read` | Get all chunks from a specific file |
| `sift_index` | Trigger indexing of a folder |
| `sift_status` | Get indexer status and configuration |

## Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Run MCP server in dev mode
npm run build        # Build for production
npm run package      # Create Desktop Extension (.mcpb)
npm test             # Run tests
```

## Key Patterns

**Chunking:** 500 tokens per chunk with 50 token overlap. Respects paragraph boundaries.

**Embeddings:** Auto-detect Ollama on localhost:11434. Fall back to configured API if unavailable.

**Search:** Cosine similarity in PGLite with pgvector. Returns top 10 chunks by default.

**File watching:** (v0.2) Use chokidar to watch indexed folders, auto-reindex on changes.

## Configuration

Config at `~/.sift/config.json`:

```json
{
  "folders": ["~/Documents", "~/Projects"],
  "embeddings": {
    "provider": "ollama",
    "model": "nomic-embed-text"
  },
  "chunking": {
    "max_tokens": 500,
    "overlap": 50
  }
}
```

## Privacy Model

- Documents never leave your machine
- Embeddings local by default (Ollama)
- No telemetry, no accounts
- Database is a local SQLite file

## Tech Stack

- **Runtime:** Node.js 20+
- **Database:** PGLite (SQLite + pgvector)
- **PDF:** pdf.js
- **DOCX:** mammoth.js
- **MCP:** @modelcontextprotocol/sdk
- **Packaging:** Desktop Extension (.mcpb)
