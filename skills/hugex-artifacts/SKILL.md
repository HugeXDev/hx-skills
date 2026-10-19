---
name: hugex-artifacts
description: "Create, edit, debug, and roll back HugeX artifacts: web apps with optional SQLite storage and Worker connections. Load for artifact files, version conflicts, logs, SELECT queries, or browser and server Worker integrations."
metadata:
  hx:
    version: "0.1.0"
    minServerVersion: "2.0.0"
---

# Build artifacts

An artifact is a web app edited without a build step. Publishing a working version updates the served app and reloads open browsers. Connect `hugex` with `artifacts:read` and, for changes, `artifacts:write`. Product permissions still apply.

## Read, change, verify

1. Use `artifact_list` to discover existing apps. Create with `artifact_create` using `slug`, `title`, and optional `template` (`blank`, `dashboard`, `table`, or `process-form`). Slugs are immutable, 2–48 lowercase letters/digits/hyphens, starting with a letter or digit; reserved names are rejected.
2. Call `artifact_read` with `slug`; preserve files and record `activeVersion`. Optional `path` and `version` read a specific file or historical version. For a historical read, `version` identifies those files while `activeVersion` identifies the currently served version.
3. Call `artifact_write` with `slug`, `files`, `message`, and `baseVersion` equal to the current `activeVersion`. Files are changes: `{path, content}` creates/replaces, `{path, content: null}` deletes. Do not resend unchanged files or send an empty change. This publishes code immediately.
4. On `conflict`, reread the active files, merge the intended changes, and retry against their version. Never overwrite concurrent edits by merely substituting a newer version ID.
5. Check the write result for activation, warnings, or failure. A failed server startup leaves the previous working version served. Get the actual browser URL with `artifact_url`; private URLs contain an access key and must stay private. Test the page, then inspect `artifact_logs` (optional `source`: `browser`, `server`, `system`; `limit`: 1–1000). State which browser interactions were actually verified.

## File and runtime contract

| File | Contract |
| --- | --- |
| `artifact.json` | Required JSON: `{"title":"My app","libs":[],"theme":"none"}` |
| `index.html` | Required entry page; runtime injects base URL, import map, theme, reload client, and Worker helper |
| `app.js`, `style.css`, other client files | Relative paths, for example `./app.js`; no JSX/TSX compilation or dependency installation |
| `server.js` | Optional API and persistent state; `import { ArtifactApp } from "./artifact-app.js"` and `export class App extends ArtifactApp` |

- File paths are relative with no leading slash, backslash, or `.` / `..` segment. Browser modules and requests must respect the injected URL base: `fetch("api/items")`, never `fetch("/api/items")`.
- **Do not use `localStorage` or `sessionStorage`.** Artifacts in an environment share an origin. Store persistent state in the artifact's SQLite through `server.js`.
- Only `api/...` routes reach `server.js`; there, `request.url` has a pathname such as `/api/items`. Other routes serve static files. `artifact.json` and `server.js` are not served as public source files.
- The server has no external network access. Use SQLite and authorized Workers through `this.env.HX`; browser API connections are restricted to the artifact's origin. Images must be artifact files or data/blob URLs.
- For libraries, choose catalog names in `libs`: `preact`, `preact/hooks`, `htm`, `alpinejs`, `daisyui`, `lucide`, `chart.js`, `echarts`, `tabulator-tables`, `@tanstack/table-core`, `luxon`, `sortablejs`, `marked`, `dompurify`. The runtime pins catalog versions and integrity. An unknown name is a warning, not automatic library provisioning: supply an exact-version import map and integrity only when necessary.
- Tailwind is available. Styles are free; `theme: "none"` is the default and `"hugex"` enables institutional typography. For Markdown, use `DOMPurify.sanitize(marked.parse(text))`; never insert raw model HTML.

## SQLite, versions, and access

Use the [SQLite server example](references/sqlite.md) when storing data. Initialize tables idempotently in `App`'s constructor, bind SQL values with `?`, and validate request input. Do not override runtime methods `__hxQuery` or `__hxHealth`.

`artifact_query` accepts `{slug, sql}` with exactly one SELECT. `WITH`, multiple statements, and data mutations are rejected. Use it to verify persisted data; writes belong in validated application API routes.

`artifact_versions` lists versions and the current `activeVersion`. `artifact_rollback` with `{slug, version}` reactivates a previously active code version. **Rollback never reverts SQLite data.** Make migrations backward compatible: avoid destructive changes and add columns with defaults so old code still works.

`artifact_settings` changes `group`, `public`, or `rotateKey`. Change audience/public access only when requested; key rotation invalidates old private links and closes open tabs. Artifact deletion is not available through MCP; use the product's Artifacts action menu when requested.

## Connect Workers

Use `hugex-worker-artifact` for discovery, an authorized test, grants, and publication. Read [Worker patterns](references/worker-patterns.md) for complete minimal chat and form files.

- Path A: `window.hx.worker(flowId, options)` streams using visitor permissions. The helper is injected automatically. A private Worker requires visitor login; a public Worker permits anonymous use.
- Path B: `this.env.HX.ask(flowId, {message, sessionId?, inputs?})` in `server.js` awaits `{text, sessionId}` using the owner's granted access, even for anonymous visitors. Keep `flowId` fixed server-side; scope and validate public input deliberately.
- Both require `artifact_workers` with `{slug, action: "grant", flowId}` by the artifact owner. List with `action: "list"`; revoke with `action: "revoke"` (owner or admin).
- Wait for each turn to finish. Keep returned sessions separate from MCP conversations. Catch failures and show generic errors to visitors.

For product context, see [HugeX concepts](https://docs.hugex.co/introduction/concepts/) and [Worker sharing](https://docs.hugex.co/build/share/).
