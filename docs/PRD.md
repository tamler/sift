# Sift - Local RAG for Claude

**Version:** 2.0
**Status:** Open Source Project
**License:** MIT
**Repository:** github.com/tamler/sift

---

## What is Sift?

Sift gives Claude (Desktop, Cowork, and Code) semantic search over your local documents. Point it at folders, it indexes them, and Claude can now answer questions using your files as context.

**No cloud uploads. No subscriptions. Your documents stay on your machine.**

---

## How It Works

```
Your Documents (any local folder)
         |
         v
    Sift Indexer
    (PDF, DOCX, TXT, MD)
         |
         v
    Embeddings
    (Ollama local, or Voyage/OpenAI API)
         |
         v
    PGLite Database
    (SQLite + pgvector, local file)
         |
         v
    MCP Server
    (packaged as Desktop Extension)
         |
         v
    Claude Desktop / Cowork / Claude Code
    (searches via MCP, synthesizes answers)
```

**Key insight:** Claude is the LLM. Sift just finds relevant chunks and returns them. Claude does the thinking using your existing subscription.

---

## Installation

### Claude Desktop / Cowork

1. Download `sift.mcpb` from GitHub releases
2. Double-click to install
3. Select folders to index
4. Start asking Claude questions about your docs

### Claude Code

```bash
/plugin install github:user/sift
```

---

## MCP Tools

### `sift_search`

Semantic search across indexed documents.

```typescript
{
  name: 'sift_search',
  input: {
    query: string,       // What to search for
    limit?: number,      // Max results (default: 10)
    folder?: string      // Filter to specific folder
  },
  output: {
    results: Array<{
      file: string,      // File path
      content: string,   // Matching chunk
      score: number      // Similarity score
    }>
  }
}
```

**Example:**
```
User: "What did I write about pricing?"
Claude: [calls sift_search with query="pricing"]
Sift: Returns top 10 relevant chunks
Claude: Synthesizes answer with citations
```

### `sift_list`

List indexed files and folders.

```typescript
{
  name: 'sift_list',
  input: {
    folder?: string,     // Filter to folder
    stats?: boolean      // Include chunk counts
  },
  output: {
    files: Array<{
      path: string,
      chunks: number,
      indexed_at: string
    }>,
    total_files: number,
    total_chunks: number
  }
}
```

### `sift_read`

Get all chunks from a specific file.

```typescript
{
  name: 'sift_read',
  input: {
    file: string         // File path
  },
  output: {
    file: string,
    chunks: Array<{
      index: number,
      content: string
    }>
  }
}
```

### `sift_index`

Trigger indexing of a folder.

```typescript
{
  name: 'sift_index',
  input: {
    folder: string,      // Folder to index
    recursive?: boolean  // Include subfolders (default: true)
  },
  output: {
    files_indexed: number,
    chunks_created: number,
    errors: string[]
  }
}
```

### `sift_status`

Get indexer status and configuration.

```typescript
{
  name: 'sift_status',
  input: {},
  output: {
    indexed_folders: string[],
    total_files: number,
    total_chunks: number,
    embedding_provider: 'ollama' | 'voyage' | 'openai',
    last_indexed: string
  }
}
```

---

## Embeddings

Sift supports multiple embedding providers. Local (Ollama) is preferred for privacy and cost.

### Option 1: Ollama (Recommended)

Free, local, private. Requires [Ollama](https://ollama.ai) installed.

```bash
# Install Ollama, then pull an embedding model
ollama pull nomic-embed-text
```

Sift auto-detects Ollama on startup.

### Option 2: API Key (Fallback)

If Ollama isn't available, configure an API key:

**Voyage AI** (Anthropic-recommended):
```json
{
  "embeddings": {
    "provider": "voyage",
    "api_key": "pa-xxx",
    "model": "voyage-3"
  }
}
```

**OpenAI**:
```json
{
  "embeddings": {
    "provider": "openai",
    "api_key": "sk-xxx",
    "model": "text-embedding-3-small"
  }
}
```

---

## Supported File Types

| Type | Extension | Parser |
|------|-----------|--------|
| PDF | `.pdf` | pdf.js |
| Word | `.docx` | mammoth.js |
| Text | `.txt` | native |
| Markdown | `.md` | native |

Future: `.html`, `.epub`, `.rtf`, code files

---

## Configuration

Config stored at `~/.sift/config.json`:

```json
{
  "folders": [
    "~/Documents/research",
    "~/Projects/notes"
  ],
  "embeddings": {
    "provider": "ollama",
    "model": "nomic-embed-text"
  },
  "chunking": {
    "max_tokens": 500,
    "overlap": 50
  },
  "database": "~/.sift/sift.db"
}
```

---

## Architecture

### Components

```
sift/
├── core/                 # Shared library
│   ├── indexer.ts        # Document parsing + chunking
│   ├── embeddings.ts     # Ollama / API client
│   ├── database.ts       # PGLite + pgvector
│   └── search.ts         # Vector similarity search
├── mcp/                  # MCP server
│   ├── server.ts         # MCP protocol handler
│   └── tools.ts          # Tool implementations
├── extension/            # Desktop Extension packaging
│   ├── manifest.json
│   └── sift.mcpb
└── cli/                  # Optional CLI
    └── index.ts          # sift index, sift search, etc.
```

### Database Schema

```sql
CREATE TABLE documents (
  id INTEGER PRIMARY KEY,
  file_path TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  embedding BLOB,  -- 384-dim for nomic, 1024 for voyage
  indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(file_path, chunk_index)
);

CREATE INDEX idx_embedding ON documents
  USING ivfflat (embedding vector_cosine_ops);
```

### Tech Stack

- **Runtime:** Node.js (for MCP server)
- **Database:** PGLite (SQLite + pgvector)
- **PDF parsing:** pdf.js
- **DOCX parsing:** mammoth.js
- **Embeddings:** Ollama (local) or Voyage/OpenAI (API)
- **Packaging:** Desktop Extension (.mcpb)

---

## Privacy Model

1. **Documents never leave your machine** - All indexing happens locally
2. **Embeddings are local by default** - Ollama runs on your hardware
3. **No telemetry** - Sift doesn't phone home
4. **No accounts** - Just install and use
5. **Database is yours** - Plain SQLite file you can inspect/delete

If you use an API for embeddings (Voyage/OpenAI), text chunks are sent to that provider. Use Ollama to stay fully local.

---

## Development

### Prerequisites

- Node.js 20+
- Ollama (optional, for local embeddings)

### Setup

```bash
git clone https://github.com/tamler/sift
cd sift
npm install
npm run build
```

### Testing Locally

```bash
# Run MCP server directly
npm run dev

# Build Desktop Extension
npm run package
```

### Contributing

PRs welcome. Areas to help:
- Additional file type parsers
- Embedding provider integrations
- Performance optimization
- Documentation

---

## Roadmap

### v0.1 - MVP
- [ ] Core indexer (PDF, DOCX, TXT, MD)
- [ ] Ollama embeddings
- [ ] PGLite database
- [ ] MCP server with search/list/read tools
- [ ] Desktop Extension packaging

### v0.2 - Polish
- [ ] File watcher (auto-reindex on changes)
- [ ] Voyage/OpenAI fallback
- [ ] Claude Code plugin
- [ ] Better chunking (respect headers, paragraphs)

### v0.3 - Advanced
- [ ] Incremental indexing (only changed files)
- [ ] Multiple databases (work vs personal)
- [ ] Code file support with syntax awareness
- [ ] Image/OCR support

---

## FAQ

**Q: Why not just use Claude's file upload?**
A: File upload has size limits, doesn't persist, and requires re-uploading. Sift indexes once and your docs are always available.

**Q: Why not use a cloud RAG service?**
A: Privacy. Your documents never leave your machine with Sift.

**Q: Do I need to pay for anything?**
A: No. Sift is free, Ollama is free, and Claude (Desktop/Cowork) uses your existing subscription.

**Q: How is this different from Cursor/Copilot context?**
A: Those are code-focused. Sift works with any documents - research papers, contracts, notes, etc.

---

## License

MIT License. Use it, fork it, improve it.

---

*Sift: Let Claude search your documents.*
