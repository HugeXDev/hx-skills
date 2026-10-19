---
name: hugex-worker-artifact
description: "Connect an existing HugeX Worker to an artifact chat or form, from discovery and an authorized test through grants, publishing, and verification. Load when a user asks for a web app or interface powered by a Worker."
metadata:
  hx:
    version: "0.1.0"
    minServerVersion: "2.0.0"
---

# Connect a Worker to an artifact

Use the `hugex` MCP connection with `workers:read`, `artifacts:read`, and `artifacts:write`; request `workers:run` for an authorized execution test. OAuth scopes do not replace object permissions or user authorization for external effects.

## Choose the runtime path

| | A: browser | B: artifact server |
| --- | --- | --- |
| Use for | Interactive streaming chat | Forms, processing, complete-response queries |
| API | `window.hx.worker(flowId, options)` | `this.env.HX.ask(flowId, input)` in `server.js` |
| Permissions | Visitor access; anonymous for a public Worker, login for a private Worker | Artifact owner's access recorded at grant time, even for an anonymous visitor |
| Response | Tokens, final text, and runtime events | Awaited `{text, sessionId}` |

Both paths require an explicit artifact Worker grant. Path B exposes an owner-authorized operation to artifact visitors: keep the Worker ID fixed in server code and accept only the intended input. Choose the audience and allowed operation deliberately.

## End-to-end steps

1. **Find the Worker.** Call `worker_list` and follow `nextPage`, then `worker_get` with `{"flowId":"<RETURNED-ID>"}`. Inspect name, description, and public access. If none fits, MCP cannot create a Worker: create and test it on the product [canvas](https://docs.hugex.co/build/quickstart/), then rediscover it.
2. **Test the intended operation.** With the user's authorization for its possible effects, call `worker_run` with `flowId` and a nonempty `message` (optional `inputs`). Record the returned text and `sessionId`. This MCP conversation does not continue the artifact's conversation. If the test is not authorized, record it as unverified and resolve authorization before running it.
3. **Create the artifact.** Call `artifact_create` with `slug`, `title`, and a supported `template`: `blank` for a chat shell, `process-form` for a form, or `dashboard` / `table` for those layouts. These are the only template names; the Worker examples below are code to write afterward. For an existing artifact, read and preserve its files instead.
4. **Grant access.** As artifact owner, call `artifact_workers` with `{"slug":"<SLUG>","action":"grant","flowId":"<CONFIRMED-ID>"}`. Verify with `action: "list"`. Grant/revoke need `artifacts:write`; list needs `artifacts:read`. Only the owner grants; owner or admin can revoke.
5. **Write the UI.** Load `hugex-artifacts` and its [Worker examples](../hugex-artifacts/references/worker-patterns.md). The guide's `read` mode can retrieve that skill and its references if sibling files are unavailable. Use path A's chat or path B's form, replacing the Worker placeholder with the confirmed ID. Read `artifact_read` immediately before writing; send only changed `{path, content}` files, a `message`, and its exact `activeVersion` as `baseVersion` to `artifact_write`.
6. **Verify.** Confirm the write activated successfully, then obtain the actual URL from `artifact_url`. Open it, test the authorized interaction, and inspect `artifact_logs` afterward for browser/server/system errors. For stored data, use `artifact_query` with a single SELECT. A successful MCP Worker turn or code publish alone does not verify browser streaming or the form. Report any unavailable browser or execution check explicitly.

## Recover from common errors

| Problem | Next action |
| --- | --- |
| Scope missing | Repeat OAuth consent with the required read/write or run scope |
| Worker unavailable | Use `worker_list` / `worker_get` again and confirm the environment, activity, and user access |
| Browser connection closes before opening, or server ask fails | Check `artifact_workers` with `action: "list"`; have the owner grant the exact Worker; confirm visitor access for A and Worker availability for B |
| Write conflict | Read the latest files and `activeVersion`, merge changes, and retry with that version |
| Server startup fails | Inspect `artifact_logs`, fix `server.js`, and publish against the currently active version; the previous working version stays served |
| Wrong file/API URL | Use relative `./app.js` and `fetch("api/ask")`; preserve the URL base and private key path |
| Browser shows nothing after MCP test | Check the artifact's separate session and runtime path; do not reuse the MCP session as proof of UI behavior |

Keep private URLs private and change visibility only if requested. Treat Worker output as untrusted text; sanitize parsed Markdown before rendering HTML.
