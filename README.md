# Local RAG Remover

Linux-first desktop control center for inspecting and cleaning AI memory and retrieval indexes.

## Linux quick start

```bash
npm install
npm start
```

Build an AppImage:

```bash
npm run dist:linux
./dist/Local\ RAG\ Remover-0.1.0.AppImage
```

## Current foundation

- Turkish-first Electron desktop shell with responsive layout.
- Provider-neutral record schema and adapter-shaped IPC boundary.
- Local demo records clearly marked as synthetic.
- Search, type filtering, selection, confirmation, and deletion flow.
- OpenAI-compatible endpoint configuration surface with local safe-storage capability detection.
- Linux AppImage packaging; Windows NSIS script is prepared with `npm run dist:win`.
- GGUF dosyaları binary model formatı olduğu için satır silme kapsamına alınmaz; metadata/tensor inceleme ayrı bir güvenli modül olarak ele alınır.

## Safety and scope

The demo source is in-memory and synthetic. It does not touch a user's files, browser profile, API history, model weights, or credentials. Real providers must be connected through explicit adapters because “model memory” is not a universal API: some products expose conversation data, some expose vector indexes, and some expose no deletion API at all.

The next production adapter layer should implement, per provider: `discover()`, `scan()`, `search()`, `previewDelete()`, and `delete()` with a provider capability report. Delete should remain disabled when a provider cannot prove the target record and its deletion semantics.

## DONATE

USDT TRC20 | `TYCK6ZyMS6UDt787foPH2QwFuvkdqMw1Jv`

USDT BSC20 | `0x15aac92a1945ddbe5c79304bfa388d6be99b26a3`

Created by **TAPSIN**
