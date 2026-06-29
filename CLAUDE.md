## Code intelligence — prefer codebase-memory-mcp, fall back to graphify

This project has two indexers. They do different jobs — pick the right one to avoid burning tokens.

**Default for structural code questions → codebase-memory-mcp (free, no LLM).**
Use its MCP tools for: "who calls X", "where is Y defined", "trace call chain", "find route handler", "what does this import", impact analysis, refactor candidates, dead code, architecture overview.
- `search_graph` to find symbols by name/label/qualified-name
- `trace_path` for call chains / data flow / cross-service
- `get_code_snippet` for exact source by qualified name
- `query_graph` for Cypher-style patterns
- `get_architecture` for project structure
- `search_code` for graph-augmented text search
- If the project is not indexed yet, run `index_repository` first.

**Use graphify only when codebase-memory-mcp cannot answer.** Graphify uses LLM extraction and costs tokens per run/query — do not invoke for routine code lookups.
Reach for it when:
- The question is conceptual / cross-domain NL ("how does X relate to Y across docs+code", "explain this subsystem in plain language").
- You need community detection, the wiki (`graphify-out/wiki/index.md`), or `GRAPH_REPORT.md` for broad architecture review.
- The corpus includes non-code (PDFs, transcripts, images) that codebase-memory-mcp does not index.

Do **not** run `graphify query` as a default for code questions anymore. Do **not** auto-run `graphify update .` after edits — only refresh when the next task actually needs graphify. The existing `graphify-out/` snapshot is fine to read passively.
