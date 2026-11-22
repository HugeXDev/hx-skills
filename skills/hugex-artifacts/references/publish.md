# Batch publish

`artifact_publish` stages many MCP calls and publishes them as one version. Use it when files that must be served together do not fit in one `artifact_write` (8 MiB body, 7 MB per file). A chained `artifact_write` publishes each success immediately, so visitors can see a partial app. Batch publish keeps the previous version served until one `commit`.

The skill's two-write example (`aaa` → `bbb` for `style.css`, then `bbb` → `ccc` for `app.js`) is the right path when each call is a complete change, and the only path when `artifact_publish` is not listed. If `style.css` and `app.js` must appear together, put both in `paths` and stage them in separate batches from `baseVersion` `aaa`. One `commit` then serves a single new version. There is no served `bbb` in between.

Call `tools/list` first. If `artifact_publish` is absent, the server is older than 2.4.0 or the grant cannot write artifacts. Use the chained `artifact_write` example in the skill. Do not send `action`, `draftId`, or `paths` to `artifact_write`. The skill minimum stays 2.3.0 so those servers still follow the rest of the skill. A call without `artifacts:write` is rejected with `insufficient_scope` and scope `artifacts:read artifacts:write`. A grant that can write but cannot manage the artifact is `forbidden`, and any open draft stays as it was.

The tool requires `artifacts:write` and permission to manage the artifact. A read-only grant is rejected. The actor is the signed-in account. The payload has no `actor` or `author` field. Extra keys are rejected (`unknown argument`). Each action accepts only the keys below. `additionalProperties` is false.

| action | keys |
| --- | --- |
| `begin` | `slug`, `action`, `draftId`, `baseVersion`, `message`, `paths` |
| `stage` | `slug`, `action`, `draftId`, `batchId`, `changes` |
| `status`, `commit`, `abort` | `slug`, `action`, `draftId` |

`draftId` and `batchId` are UUIDs you choose. `changes` matches `files` on `artifact_write`: `{path, content}` creates or replaces, `{path, content: null}` deletes. `paths` is the exact manifest, including deletions. `message` is a non-empty string of at most 4000 characters.

## When to begin

Read `artifact_read` and copy `activeVersion` into `baseVersion`. Use JSON `null` only when that field is null (nothing is served yet). `begin` stores that value and does not compare it with the live version. The comparison happens inside `commit`.

```json
{
  "slug": "demo",
  "action": "begin",
  "draftId": "2f1c0a4e-7b6d-4e2a-8c11-9a0b1c2d3e4f",
  "baseVersion": "aaa",
  "message": "publish the board",
  "paths": ["index.html", "app.css"]
}
```

`aaa` stands in for the sha256 from `artifact_read.activeVersion`. A successful begin:

```json
{
  "ok": true,
  "draftId": "2f1c0a4e-7b6d-4e2a-8c11-9a0b1c2d3e4f",
  "baseVersion": "aaa",
  "expiresAt": "2026-11-23T14:00:00.000Z",
  "state": "open",
  "missingPaths": ["app.css", "index.html"],
  "stagedPaths": 0,
  "batchCount": 0,
  "result": null,
  "error": null
}
```

`missingPaths` is sorted. `expiresAt` is 24 hours after this begin. Repeating `begin` with the same `draftId`, the same `baseVersion` (including `null`), the same `message`, and the same path set returns that header's current state for as long as the header exists: `open`, `committed`, `aborted`, or `expired`. The match does not depend on the path rows. Those rows are released on commit, abort, and expiry, and the header still answers. A different payload for the same `draftId` is `{ "ok": false, "code": "invalid", "error": "draftId already used" }`. `status` reads the same header without resending the payload. Start the next change with a new `draftId` while the old header still exists. After the header is deleted, that `draftId` can be opened again.

## Stage

Send one batch per call. Every path must be in `paths`. Each path is accepted once for the draft. Validate the whole batch before anything is stored: one bad path rejects the call and leaves previous batches as they were.

```json
{
  "slug": "demo",
  "action": "stage",
  "draftId": "2f1c0a4e-7b6d-4e2a-8c11-9a0b1c2d3e4f",
  "batchId": "6c0e9f10-2a4b-4d55-9e77-1b2c3d4e5f60",
  "changes": [{ "path": "app.css", "content": "body{}" }]
}
```

Success has the same fields as begin. `missingPaths` shrinks, `stagedPaths` and `batchCount` grow, and `result` stays null. File contents are never returned.

Retry the same `batchId` with the same path and content pairs. Order does not matter. The retry returns progress and does not write a second copy. The same `batchId` with different contents is `{ "ok": false, "code": "invalid", "error": "batchId already used with a different payload" }` and the first batch remains.

| stage rejection | meaning |
| --- | --- |
| `path is not in the draft manifest: <path>` | the path was not in `begin.paths` |
| `path already staged: <path>` | that path was already accepted; abort and begin a new draft to change those bytes |
| `duplicate path: <path>` | the same path appears twice in one batch or in `paths` |
| `draft is committed`, `draft is aborted`, or `draft is expired` | that draft no longer accepts batches |

If this environment cannot serve Worker connections and a staged file uses `this.env.HX` or `hx.worker(`, the stage success may add `warnings` with the same "worker_connection_unavailable" texts as `artifact_write`. Those warnings are only on that response. Staging does not create or change grants, and it does not change the served version.

## Status, commit, abort

`status` returns the same fields as begin, without file contents.

- `open`: live `missingPaths`, `stagedPaths`, and `batchCount`. `result` is null.
- `committed`, still before `expiresAt`: `result` is the stored publish result. `missingPaths` is empty. `stagedPaths` and `batchCount` are the counts saved at commit. The staged rows are already gone; the file bytes belong to the published version. This receipt stays until `expiresAt` and is not deleted to make room for other headers.
- `aborted`: `result` is null and `missingPaths` is empty. Repeating `abort` returns this status. The served version is unchanged.
- `expired`: `result` is null. A version published before expiry stays served. Another `commit` returns `{ "ok": false, "code": "invalid", "error": "draft is expired" }` and does not publish again.

`commit` when every manifest path is staged and `baseVersion` is still the served version:

```json
{ "slug": "demo", "action": "commit", "draftId": "2f1c0a4e-7b6d-4e2a-8c11-9a0b1c2d3e4f" }
```

Inside the publish lock, in this order:

1. A draft already `committed` and not yet expired returns the stored `result`. It does not activate again and does not reload browsers, even if a later `artifact_write` or rollback moved the served version.
2. If the draft's `baseVersion` is not the served version, the result is `{ "ok": false, "code": "conflict", "activeVersion": "<served>", "draftId": "<draftId>" }`. The draft stays `open`. Retrying `commit` does not publish. Call `abort`, reread `artifact_read`, merge, and `begin` with the new `activeVersion`.
3. If any manifest path is still unstaged, the result is `{ "ok": false, "code": "missing", "missingPaths": ["app.css"], "draftId": "<draftId>" }`. Nothing is published. When the base is also stale, step 2 wins and the response is `conflict`.
4. Otherwise one version is published. The previous version stays in history.

Success:

```json
{
  "ok": true,
  "draftId": "2f1c0a4e-7b6d-4e2a-8c11-9a0b1c2d3e4f",
  "baseVersion": "aaa",
  "expiresAt": "2026-11-23T14:00:00.000Z",
  "state": "committed",
  "missingPaths": [],
  "stagedPaths": 2,
  "batchCount": 2,
  "result": { "ok": true, "version": "ddd", "state": "activa", "warnings": [] },
  "error": null
}
```

`result.version` is the `baseVersion` for the next `artifact_write` or the next `begin`. `result.warnings` lists unknown catalog libraries, the same as `artifact_write`. Visitors move from the previous served version to `ddd` once. There is no intermediate version for each batch.

If activation fails, `commit` returns `{ "ok": false, "code": "failed", "version": "<id>", "state": "fallida", "error": "<diagnostic>", "draftId": "<draftId>" }`. The previous version stays served and the draft stays `open`. A later `status` shows that `error`. Retry `commit` when the staged bytes are still the ones you want (for example after a transient boot failure). To change bytes already accepted, `abort` and begin a new draft. A path cannot be staged twice.

`abort` is safe to repeat. An `open` draft becomes `aborted` and drops its staged batches. A second abort returns `state: "aborted"`. Aborting a `committed` draft does not unpublish it: the response stays `committed` and includes `result`.

## Limits and expiry

| Limit | Value |
| --- | --- |
| Draft lifetime | 24 hours from `begin` (`expiresAt`) |
| Open drafts | 3 per artifact (`at most 3 open drafts`) |
| Manifest | 500 paths (`at most 500 paths`) |
| Batches | 100 per draft (`at most 100 batches`) |
| File | 7 MB (`file exceeds 7 MB: <path>`) |
| MCP body | 8 MiB per call |
| Version | 64 MiB (`version exceeds 64 MiB`) |
| Pending staged content | 64 MiB of UTF-8 across open drafts (`pending content exceeds 64 MiB`) |
| Stored artifact data | 2 GB (`storage limit exceeded`) |
| Aborted or expired headers | 64. A later call on a deleted header is `{ "ok": false, "code": "invalid", "error": "draft not found" }` |

Deletions do not count toward the pending-content cap. A limit response is `{ "ok": false, "code": "limit", "error": "<message>" }`. An invalid response is `{ "ok": false, "code": "invalid", "error": "<message>" }`. `commit` also returns `invalid` with `no changes` when the staged tree matches the served files, and with `artifact.json is required` or `index.html is required` when the result would drop either file. The draft stays open.

After `expiresAt`, an `open`, `committed`, or `aborted` draft becomes `expired`, its receipt is cleared, and a version already published stays served. Finish or abort before expiry. At most three drafts may be `open`; committed, aborted, and expired drafts do not count toward that cap. At most 64 `aborted` or `expired` headers are kept; the oldest are deleted. A `committed` receipt inside its TTL is outside that cap. `status`, `stage`, `commit`, and `abort` on a deleted header return `draft not found` and leave the served version unchanged. Once that header is gone, `begin` may use the same `draftId` again.

## Verify

1. `begin` returns `ok: true`, `state: "open"`, and `missingPaths` equal to the sorted manifest.
2. After the last `stage`, `missingPaths` is empty. Use `status` to confirm; it has no file contents.
3. `commit` returns `state: "committed"` and `result.state: "activa"`.
4. `artifact_read.activeVersion` equals `result.version`. Open `artifact_url` and test the page. Private URLs stay private.
5. A second `commit` with the same `draftId` returns the same `result` and does not reload browsers.

| situation | what you get |
| --- | --- |
| same `begin` while the header exists, including after commit, abort, or expiry | that header's current state; path rows are not required |
| same `draftId` with a different base, message, or path set | `invalid` with `draftId already used` |
| same `stage` | progress, no second write |
| same `batchId`, different contents | `invalid`; the first batch stays |
| `status` or `commit` on a committed draft inside `expiresAt` | stored `result`, no second publish |
| `commit` with a stale base | `conflict`; the draft stays until abort or expiry |
| `commit` with paths left | `missing`; no new version |
| activation failure | `failed`; the previous version stays served; `commit` can be retried |
| expiry | `expired`, receipt cleared; no second publish |
| aborted or expired header removed after the 64-header cap | `invalid` with `draft not found`; the served version stays |
| slug deleted and recreated, or a draft from an earlier artifact with the same slug | `not_found`, or `invalid` with `draft not found`; the new version is left as it is |
| account is not allowed to manage the artifact | `forbidden`; the draft is unchanged |
| manage permission removed between calls | `forbidden` before the draft is touched; the draft stays `open` |

A missing or empty `draftId` or `batchId` is rejected before a draft is written (`draftId must be a UUID` or `batchId must be a UUID`). A non-UUID string is `invalid` with the same text.
