# Product

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Stack

delegated: Electron, vanilla HTML/CSS/JavaScript, Node.js; Linux AppImage first, Windows NSIS second.

## Users

Local AI users and developers who need to inspect, search, and remove stale or unnecessary memory/index data from connected AI tools.

## Product Purpose

LocalRAGRemover makes connected model memory and retrieval indexes visible in one desktop workspace, with fast search, safe review, and explicit deletion.

## Positioning

A provider-neutral, local-first memory control center: one consistent view over local files, SQLite/vector indexes, and OpenAI-compatible endpoints without copying credentials or source data into a third-party service.

## Operating Context

Linux desktop first. Users connect local folders/databases or an OpenAI-compatible API, scan/index metadata, inspect records, select unnecessary entries, and delete only after confirmation. Windows packaging follows after Linux verification.

## Capabilities and Constraints

- Turkish-first interface with responsive desktop layout.
- Provider adapters must expose capabilities and clear connection errors.
- Local sources are read-only during scanning; destructive actions require an explicit confirmation.
- API keys are stored locally using Electron safe storage when available and are never placed in logs.
- Demonstration records are clearly marked synthetic.
- Open decisions: first production vector database adapters and exact model-memory APIs depend on user-selected providers.

## Product Principles

- Show the data before changing it.
- Keep providers interchangeable.
- Make destructive actions deliberate and reversible where possible.
- Preserve source files and credentials outside the app's explicit scope.

## Accessibility & Inclusion

Keyboard focus, readable contrast, clear status text, and non-color-only selection states are required.
