---
name: hugex-artifacts
description: "Create, edit, debug, and roll back HugeX artifacts: web apps with optional SQLite storage and Worker connections. Load for artifact files, version conflicts, batch publishing, logs, usage stats, SELECT queries, or browser and server Worker integrations."
metadata:
  hx:
    version: "0.6.0"
    minServerVersion: "2.3.0"
---

# Build artifacts

An artifact is a web app edited without a build step. Publishing a working version updates the served app and reloads open browsers. Connect `hugex` with `artifacts:read` and, for changes, `artifacts:write`. Product permissions still apply.

## Read, change, verify

1. Use `artifact_list` to discover existing apps. Create with `artifact_create` using `slug`, `title`, and optional `template` (`blank`, `dashboard`, `table`, or `process-form`). Slugs are immutable, 2–48 lowercase letters/digits/hyphens, starting with a letter or digit; reserved names are rejected.
2. Call `artifact_read` with `slug` to get `activeVersion` and the file listing (`{path, size, hash}`, without content). Read each file you need to inspect or change by passing `path` (one file per call). Optional `version` reads a historical version while `activeVersion` identifies the currently served version.
3. Call `artifact_write` with `slug`, `files`, `message`, and `baseVersion`. The first write copies `baseVersion` from `artifact_read.activeVersion` or `artifact_versions.activeVersion`. Each later write copies `baseVersion` from the previous success field `version` (`artifact_write` and `artifact_rollback` return `version`, with `state: "activa"`). `artifact_write` is a diff: send only changed files (`{path, content}` creates/replaces, `{path, content: null}` deletes; do not resend unchanged files or send an empty change). Each success publishes immediately: that `version` becomes the served app and open browsers reload. The previous version stays in history. A later success replaces what the earlier success published. Each call allows an 8 MiB body (7 MB per file). Put every file that must appear together in one `artifact_write` when that set fits. When it does not fit, use [batch publish](references/publish.md) if `tools/list` includes `artifact_publish`. Chained writes are the compatible path on a server that does not list that tool: each success is served before the next call. Chain two writes like this (ids below stand in for sha256 version ids):

   ```json
   { "tool": "artifact_read", "arguments": { "slug": "demo" } }
   ```

   Response includes `"activeVersion": "aaa"`.

   ```json
   { "tool": "artifact_write", "arguments": { "slug": "demo", "baseVersion": "aaa", "message": "styles", "files": [{ "path": "style.css", "content": "body{color:#222}" }] } }
   ```

   `{ "ok": true, "version": "bbb", "state": "activa", "warnings": [] }` publishes `bbb`.

   ```json
   { "tool": "artifact_write", "arguments": { "slug": "demo", "baseVersion": "bbb", "message": "script", "files": [{ "path": "app.js", "content": "console.log('ready')" }] } }
   ```

   `{ "ok": true, "version": "ccc", "state": "activa", "warnings": [] }` publishes `ccc`. Visitors are on `bbb` after the first success and on `ccc` after the second. `bbb` stays in history for rollback. The next write uses `baseVersion` `"ccc"`.
4. On `conflict` the result is `{ "ok": false, "code": "conflict", "activeVersion": "<served>" }` and nothing is published. Sending `baseVersion` `"aaa"` after `ccc` is already served is this case. Reread the affected files with `artifact_read`, merge your edits with the concurrent ones, and retry with `baseVersion` set to that `activeVersion`. Keep the conflict guidance: substituting a newer version id and resending your old file set overwrites concurrent edits. If activation fails (`code: "failed"`, `state: "fallida"`), the previous working version stays served. Fix the code and write again with that still-active id as `baseVersion`. An `artifact_publish` conflict keeps the draft; follow [batch publish](references/publish.md) and do not resend those batches through `artifact_write`.
5. Check the write result for `state: "activa"`, warnings, or failure. Get the actual browser URL with `artifact_url`; private URLs contain an access key and must stay private. Test the page, then inspect `artifact_logs`. State which browser interactions were actually verified.

## Publish one version in batches

Use `artifact_publish` when one logical change does not fit in a single `artifact_write` and `tools/list` includes that tool. It needs `artifacts:write` and permission to manage the artifact. Servers before 2.4.0 omit the tool; keep using chained `artifact_write`. This skill's minimum server version stays 2.3.0 because the batch flow is optional and detected from the tool list.

`begin` opens a draft (`draftId`, `baseVersion`, `message`, `paths`). `stage` sends one batch (`batchId`, `changes`). `commit` publishes once, reloads browsers once, and returns `result.version` as the next `baseVersion`. `abort` drops an open draft. Repeating a successful `commit` returns the stored result and does not publish again. Requests, responses, limits, expiry, retries, and conflict handling are in [Batch publish](references/publish.md).

## File and runtime contract

| File | Contract |
| --- | --- |
| `artifact.json` | Required JSON: `{"title":"My app","libs":[],"theme":"none"}` |
| `index.html` | Required entry page; runtime injects base URL, import map, theme, reload client, and Worker helper |
| `app.js`, `style.css`, other client files | Relative paths, for example `./app.js`; no JSX/TSX compilation or dependency installation |
| `server.js` | Optional API and persistent state; `import { ArtifactApp } from "./artifact-app.js"` and `export class App extends ArtifactApp` |

- File paths are relative with no leading slash, backslash, or `.` / `..` segment. Browser modules and requests must respect the injected URL base: `fetch("api/items")`, never `fetch("/api/items")`.
- Limits: up to 7 MB per file, 64 MiB per version, and 2 GB total storage per artifact. Text files only (no binary uploads).
- **Do not use `localStorage` or `sessionStorage`.** Artifacts in an environment share an origin. Store persistent state in the artifact's SQLite through `server.js`.
- Only `api/...` routes reach `server.js`; there, `request.url` has a pathname such as `/api/items`. Other routes serve static files. `artifact.json` and `server.js` are not served as public source files.
- The server has no external network access. Use SQLite and authorized Workers through `this.env.HX`; browser API connections are restricted to the artifact's origin. Images must be artifact files or data/blob URLs.
- For libraries, choose catalog names in `libs`: `preact`, `preact/hooks`, `htm`, `alpinejs`, `daisyui`, `lucide`, `chart.js`, `echarts`, `tabulator-tables`, `@tanstack/table-core`, `luxon`, `sortablejs`, `marked`, `dompurify`. The runtime pins catalog versions and integrity. An unknown name is a warning, not automatic library provisioning: supply an exact-version import map and integrity only when necessary.
- Tailwind is available. Styles are free; `theme: "none"` is the default and `"hugex"` enables institutional typography. For Markdown, use `DOMPurify.sanitize(marked.parse(text))`; never insert raw model HTML.

## SQLite, versions, and access

Use the [SQLite server example](references/sqlite.md) when storing data. Initialize tables idempotently in `App`'s constructor, bind SQL values with `?`, and validate request input. Do not override runtime methods `__hxQuery` or `__hxHealth`.

`artifact_query` accepts `{slug, sql, limit?, offset?}` with exactly one SELECT (`WITH`, multiple statements, and data mutations are rejected). It returns `{columns, rows, truncated}` with 500 rows by default (max 1000) and a ~4 MB response cap; paginate with `limit` and `offset` while `truncated` is `true`. Use it to verify persisted data; writes belong in validated application API routes. Artifact owners can also inspect tables and export CSV from the artifact's **Data** tab in the app.

`artifact_versions` lists versions and the current `activeVersion`. `artifact_rollback` reactivates a previously active code version and publishes it: the returned `version` is served, open browsers reload, and that id is the `baseVersion` for the next write. **Rollback never reverts SQLite data.** Make migrations backward compatible: avoid destructive changes and add columns with defaults so old code still works.

Send `{slug, version, baseVersion?}`. `version` is the history id to reactivate. `baseVersion` is optional and, when present, must be the `activeVersion` you observed when you chose that target (the served version you expect to replace). If a newer publish landed first, the result is `{ "ok": false, "code": "conflict", "activeVersion": "<still served>" }` and the served version stays unchanged; reread `artifact_versions` and choose again. Example: history is at `ccc` while you confirm a rollback to `aaa`. Another publish then serves `ddd`. `artifact_rollback` with `{slug:"demo", version:"aaa", baseVersion:"ccc"}` conflicts and leaves `ddd` served. Omit `baseVersion` only when the rollback should proceed even if the active version changed. The target must exist and have been active before. Rolling back to the version that is already active returns no changes. A 2.3 server may omit `baseVersion` from the `artifact_rollback` inputs in `tools/list`. If that input is absent, do not send it: the conflict check is not available, and a valid target is activated without that protection.

`artifact_logs` reads recent messages, newest first. Filters are optional and combine: `source` (`browser`, `server`, `system`), `level` (`debug`, `info`, `warn`, `error`), `version` (a version id), and `limit` (1–1000). The response is `{slug, logs, nextCursor}`. Each log has `ts`, `source`, `level`, `message`, and `version`. When `nextCursor` is a positive decimal string, call again with the same filters and `cursor` set to that value to load the next older page. `nextCursor: null` ends the list. Copy `cursor` from `nextCursor`; do not build one from `ts`. Changing filters starts a new first page, so drop the previous cursor. Invalid `limit` or `cursor` values are rejected. To find an error behind a long log, call `artifact_logs` with `{slug, level:"error", version:"ccc", limit:100}` and follow `nextCursor` until it is null. A 2.3 server may omit `level`, `version`, and `cursor` from the `artifact_logs` inputs in `tools/list`. Send only inputs that are listed. If `level` or `version` is absent, that filter is not available. If `cursor` is absent, cursor pagination is not available; read the first page with `slug` and the inputs the schema still offers, such as `source` and `limit`.

`artifact_stats` with `{slug, days?}` (1–90, default 30) returns daily usage counters per UTC day, with zero-filled days, `totals`, `lastViewDay`, storage, version, and Worker grant counts. It counts page views (`view`; `view_key` for visits that used the private link key), API calls and server errors (`api`, `api_error`), runtime and browser errors (`error`, `browser_error`), and Worker connections from the browser, from the server, and denied ones (for example, a revoked grant still in use). It does not count unique visitors, and only the last 90 days are kept. Use `artifact_logs` with `level: "error"` for the error details.

`artifact_settings` changes `group`, `public`, or `rotateKey`. Change audience/public access only when requested; key rotation invalidates old private links and closes open tabs. Artifact deletion is not available through MCP; use the product's Artifacts action menu when requested.

## Connect Workers

Use `hugex-worker-artifact` for discovery, an authorized test, grants, and publication. Read [Worker patterns](references/worker-patterns.md) for complete minimal chat and form files.

- Path A: `window.hx.worker(flowId, options)` streams text and voice (`client.voice.start()`, `stop()`, `mute(bool)`) using visitor permissions. The helper is injected automatically. A private Worker requires visitor login; a public Worker permits anonymous use (voice also requires visitor login unless `voiceInput.allowPublic` is enabled on the Worker). See [Worker patterns](references/worker-patterns.md) for text and voice examples.
- Path B: `this.env.HX.ask(flowId, {message, sessionId?, inputs?})` in `server.js` awaits `{text, sessionId}` using the owner's granted access, even for anonymous visitors. Keep `flowId` fixed server-side; scope and validate public input deliberately.
- Both require `artifact_workers` with `{slug, action: "grant", flowId}` by the artifact owner, one grant per Worker. A "worker_connection_unavailable" warning on grant, list, or write means the environment cannot serve that path; report it instead of working around it. List with `action: "list"`; revoke with `action: "revoke"` (owner or admin).
- Wait for each turn to finish. Keep returned sessions separate from MCP conversations. Catch failures and show generic errors to visitors.

For product context, see [HugeX concepts](https://docs.hugex.co/introduction/concepts/) and [Worker sharing](https://docs.hugex.co/build/share/).
