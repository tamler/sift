# Sift

**Local RAG for Claude** - Semantic search over your documents via MCP.

Sift indexes your local documents and exposes them to Claude (Desktop, Cowork, and Code) via MCP. Ask Claude questions about your files and it will search for relevant content automatically.

**No cloud uploads. No subscriptions. Your documents stay on your machine.**

## How It Works

```
Your Documents (any local folder)
         |
         v
    Sift Indexer (PDF, DOCX, TXT, MD)
         |
         v
    Embeddings (Ollama local, or API)
         |
         v
    PGLite Database (local SQLite)
         |
         v
    MCP Server
         |
         v
    Claude Desktop / Cowork / Claude Code
```

Claude is the LLM. Sift just finds relevant chunks and returns them. No external LLM API needed.

## Installation

### Claude Desktop / Cowork

1. Download `sift.mcpb` from [Releases](https://github.com/tamler/sift/releases)
2. Double-click to install
3. Select folders to index
4. Start asking Claude questions about your docs

### Claude Code

```bash
/plugin install github:tamler/sift
```

### From Source

```bash
git clone https://github.com/tamler/sift
cd sift
npm install
npm run build
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `sift_search` | Semantic search across indexed documents |
| `sift_list` | List indexed files and folders |
| `sift_read` | Get all chunks from a specific file |
| `sift_index` | Trigger indexing of a folder |
| `sift_status` | Get indexer status and configuration |

## Embeddings

Sift supports multiple embedding providers:

### Ollama (Recommended)

Free, local, private. Install [Ollama](https://ollama.ai), then:

```bash
ollama pull nomic-embed-text
```

Sift auto-detects Ollama on startup.

### API Fallback

Configure Voyage AI or OpenAI in `~/.sift/config.json`:

```json
{
  "embeddings": {
    "provider": "voyage",
    "api_key": "pa-xxx",
    "model": "voyage-3"
  }
}
```

## Supported File Types

- PDF (`.pdf`)
- Word (`.docx`)
- Text (`.txt`)
- Markdown (`.md`)

## Privacy

- Documents never leave your machine
- Embeddings are local by default (Ollama)
- No telemetry, no accounts
- Database is a local SQLite file you control

## Development

```bash
npm run dev      # Run MCP server in dev mode
npm run build    # Build for production
npm run package  # Create Desktop Extension
npm test         # Run tests
```

## License

MIT
