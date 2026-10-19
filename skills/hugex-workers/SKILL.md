---
name: hugex-workers
description: "Find, inspect, and run HugeX Workers through MCP, including continuing a conversation with sessionId. Load when a user wants to use an existing Worker or find out how to create one on the canvas."
metadata:
  hx:
    version: "0.1.0"
    minServerVersion: "2.0.0"
---

# Use Workers

Connect the `hugex` server with OAuth as described in `hugex`. Request `workers:read` for discovery and `workers:run` for execution. Product access is checked independently of these scopes.

## Discover and inspect

1. Call `worker_list` with `{}` or `{"page":1}`. Follow each returned `nextPage`, even if the current page has few or no entries.
2. Match the user's intent against the returned names and descriptions. Results contain active Workers the signed-in user can use.
3. Call `worker_get` with `{"flowId":"<ID-FROM-LIST>"}`. Its `id` is the Worker ID passed as `flowId`; do not invent a `workerId` argument.

Summaries contain only `id`, `name`, `description`, and `public`. The MCP does not expose Worker prompts, graph, credentials, or secrets, and does not provide Worker editing or creation tools. Tool catalogs describe tools without exposing execution configuration or connections.

## Run a turn

`worker_run` is a real execution with possible external effects, not a dry run. Inspect the summary and the user's authorization before sending a message. Use an appropriately scoped test input when the user has authorized testing; do not retry uncertain executions blindly.

```json
{"flowId":"<CONFIRMED-WORKER-ID>","message":"<AUTHORIZED-MESSAGE>","inputs":{"example":"value"}}
```

`inputs` is optional; use only variables expected by the Worker. The non-streaming result is `{text, sessionId}`. Omit `sessionId` for a new conversation; reuse the returned value for subsequent turns with the same Worker and signed-in user. Its format is `art-<UUID>`. Wait for each turn to finish before sending another in that session.

MCP conversations are separate from artifact conversations. Supplying an artifact's session ID does not resume its conversation through MCP. Worker execution does not inject a visitor identity into the Worker; do not assume per-user integration credentials are present.

## Creating Workers

Worker creation through MCP is **not available**. In the product, open **Workers → Create Worker**, then configure and test it on the [canvas](https://docs.hugex.co/build/canvas/). The [first Worker tutorial](https://docs.hugex.co/build/quickstart/) builds `Start → AI Node → Answer`. Once the Worker is active and accessible, discover it again through `worker_list` and continue here. Do not invent a creation tool or private API shortcut.

## Troubleshoot

| Result | Next action |
| --- | --- |
| `insufficient_scope` or missing run tool | Reauthorize with `workers:run`; use `workers:read` for discovery |
| `Worker unavailable` | Recheck the selected environment/account and discover the Worker again; confirm it is active and accessible in the product. The error intentionally hides access details |
| Invalid arguments | Use `flowId`, a nonempty `message`, an object for `inputs`, and only a returned `art-<UUID>` session ID |
| Execution outcome uncertain | Inspect the product's activity before retrying an operation that could repeat an external effect |

For an artifact UI, load `hugex-worker-artifact`. For product testing, see [Test and debug](https://docs.hugex.co/build/testing/) and [sessions](https://docs.hugex.co/build/operate/sessions/).
