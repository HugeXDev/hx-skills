---
name: hugex-workers
description: "Find, run, create, and edit HugeX Workers through MCP: discovery, graph authoring with versioned edits, activation, test runs, and Vault credentials. Load when a user wants to use an existing Worker or build or change one."
metadata:
  hx:
    version: "0.2.0"
    minServerVersion: "2.1.0"
---

# Use and build Workers

Connect the `hugex` server with OAuth as described in `hugex`. Request only what the task needs:

| Task | Scopes |
| --- | --- |
| Discover Workers | `workers:read` |
| Run a turn | `workers:run`; add `workers:read` for discovery |
| Create, edit, activate, or deactivate | `workers:read` and `workers:write`, granted together |
| List Vault credential names | `secrets:read` |
| Create or update a Vault credential | `secrets:read` and `secrets:write`, granted together |

Product access is checked independently of these scopes.

## Discover and inspect

1. Call `worker_list` with `{}` or `{"page":1}`. Follow each returned `nextPage`, even if the current page has few or no entries.
2. Match the user's intent against the returned names and descriptions. Each summary has `id`, `name`, `description`, `public`, and `status`. By default only active Workers are listed; `{"status":"inactive"}` or `{"status":"all"}` also needs `workers:write`.
3. Call `worker_get` with `{"flowId":"<ID-FROM-LIST>"}`. Its `id` is the Worker ID passed as `flowId`; do not invent a `workerId` argument.

`worker_get` and `worker_list` never return prompts, the graph, credentials, or secrets. Reading the graph is an authoring step (`worker_get_graph`) and needs `workers:write`.

## Run a turn

`worker_run` is a real execution with possible external effects, not a dry run. Inspect the summary and the user's authorization before sending a message. Use an appropriately scoped test input when the user has authorized testing; do not retry uncertain executions blindly.

```json
{"flowId":"<CONFIRMED-WORKER-ID>","message":"<AUTHORIZED-MESSAGE>","inputs":{"example":"value"}}
```

`inputs` is optional; use only variables declared on the Worker's Start node. The result is `{text, sessionId}`, plus `runId`, `path` (visited node ids), and `outputs` (the Answer's structured output) when the Worker returns them. Outputs larger than 64 KiB are replaced by `outputsTruncated` with `bytes` and a text `preview`. Omit `sessionId` for a new conversation; reuse the returned `art-<UUID>` value for later turns with the same Worker and signed-in user. Wait for each turn to finish before sending another in that session.

A failed run returns **run_failed** with `detail`, `path`, and `runId`: fix the node at the end of `path`, then run again. Running an inactive Worker also needs `workers:read` and `workers:write`, and only its owner, an admin of its organization, or a superadmin can do it.

MCP conversations are separate from artifact conversations. Worker execution does not inject a visitor identity into the Worker; do not assume per-user integration credentials are present.

## Build or change a Worker

Confirm the goal with the user, then:

1. **Learn the nodes.** Call `worker_node_catalog` with `{}` for the summary and shared rules, then with `{"type":"<nodeType>"}` for fields, defaults, outputs, and an example. Field reference: [node reference](https://docs.hugex.co/reference/nodes/).
2. **Discover what the graph will reference.** Models: `worker_models`. Tools: `tool_list`, then `worker_tool_schema`. Skills for an AI Node: `skill_list` and `skill_get` (not `tool_list`). Knowledge: `memo_list`. Child Workers: `worker_list`. Credentials: `secret_list`.
3. **Create.** `worker_create` with `name`, optional `description`, and either `template` (`chat` or `extract`) or a full `graph`. The Worker is saved and then activated; the result has `flowId` and `stateVersion`.
4. **Read before each edit.** `worker_get_graph` returns `graph`, `stateVersion`, `status`, and warnings. The graph is returned as stored, without redaction; never repeat credential values from it.
5. **Edit.** `worker_edit` with `flowId`, `baseVersion` (the `stateVersion` you just read), and ordered `ops`. Pass `"dryRun":true` first for a non-trivial change: it returns `changes`, `errors`, and `warnings` and writes nothing. Ops and examples: [references/ops.md](references/ops.md). Use `worker_update` to replace the whole graph (also with `baseVersion`) or to change `name` or `description`.
6. **Check.** `worker_validate` with `flowId` or an unsaved `graph`.
7. **Test.** `worker_run` with an authorized test message and `inputs`.
8. **Activate or deactivate.** `worker_set_status` with `"active"` or `"inactive"`. It is the only way to change status; activation first checks the graph structure.

Saving rejects problems that the change introduces and reports problems that were already there as warnings. Limits: 200 nodes, 400 edges, 50 ops per call, and 512 KiB per graph.

**Changes to an active Worker** affect later runs once the runtime refreshes its state, not necessarily the very next run. Confirm with the user before editing a Worker that is in use.

**The canvas.** If the Worker is open on the canvas, the editor shows a version conflict on its next save and offers to reload or overwrite. Tell the user to reload rather than overwrite, or to close the Worker on the canvas while you edit.

### App tools (Composio)

1. `worker_tool_schema` with `{"toolId":"<ID>"}` returns the tool and its enabled `composioToolSlugs`.
2. `worker_tool_schema` with `{"toolId":"<ID>","toolSlug":"<SLUG>"}` returns the action's `inputSchema` and `version`.
3. In the Tool node's `data`, set `source: "composio"`, `toolId`, `toolSlug`, `toolVersion` (the returned `version`), `inputSchema`, and `args`.

The `inputSchema` you copy does not grant access: the server checks the tool row and the enabled slug.

### Credentials

Never put an API key, token, or password in node data. Ask the user for the credential name, have them provide the value through `secret_set` (`name` in `UPPER_SNAKE_CASE`, `value`, optional `description`), then reference it as `{{ secrets.NAME }}`. `secret_set` creates or updates the secret in the user's own organization and never returns the value; do not echo values back in your replies. For a superadmin editing another organization's Worker, the secret still lands in the superadmin's organization.

If a save returns **inline_credentials_detected**, stop and ask the user. Move the value to the Vault, or retry with `"acknowledgeInlineCredentials":true` only if the user explicitly accepts storing it in the graph.

### Drafts and child Workers

An inactive Worker is a draft: only its owner, an admin of its organization, or a superadmin can run it, and a Worker node may point to a new inactive child only under the same rule. Existing references are left as they are.

## Troubleshoot

| Result | Next action |
| --- | --- |
| `insufficient_scope` or missing tools | Reauthorize with the scopes in the table above; write scopes need their read pair |
| **version_conflict** | Someone saved in between. Call `worker_get_graph`, rebuild the ops on the new graph, and retry with its `stateVersion` |
| **write_partial** or **write_unknown** | Some step may have been saved. Call `worker_get_graph` with the returned `flowId` and compare before retrying; never create the Worker again blindly |
| **invalid_graph** or **op_failed** | Read `errors` (or `issue`), fix the referenced node, field, or op, and retry |
| **legacy_graph** | The Worker uses an old graph format; ask the user to recreate it on the canvas |
| **worker_blocked** | The Worker is blocked in the product; no tool can change it |
| `Worker unavailable` | Recheck the environment and account and discover the Worker again; confirm it is active and accessible. The error intentionally hides access details |
| Execution outcome uncertain | Inspect the product's activity before retrying an operation that could repeat an external effect |

For an artifact UI, load `hugex-worker-artifact`. For product testing, see [Test and debug](https://docs.hugex.co/build/testing/) and [sessions](https://docs.hugex.co/build/operate/sessions/).
