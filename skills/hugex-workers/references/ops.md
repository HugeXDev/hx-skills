# Worker graph operations

`worker_edit` applies `ops` in order to the graph read with `worker_get_graph`. The call needs `flowId`, `baseVersion` (that read's `stateVersion`), and 1–50 ops. Optional flags: `dryRun` (validate and return `changes` without writing), `returnGraph` (include the resulting graph), and `acknowledgeInlineCredentials`.

If any op fails, nothing is saved and the result is `op_failed` with the failing `op` index and an `issue`. If the graph changed since your read, the result is a version conflict with the current `stateVersion`: read again and rebuild the ops.

## Operations

| Op | Arguments | Effect |
| --- | --- | --- |
| `add_node` | `type`, optional `id`, `data`, `position`, `from`, `to` | Adds a node with the type's defaults merged with `data`. `from: {node, handle?}` connects an existing node to it; `to: {node, handle?}` connects it to an existing node |
| `insert_node` | `type`, `between: {from, to, handle?}`, optional `id`, `data` | Replaces the edge `from → to` with `from → new → to`. Accepts Knowledge, AI Node, API, Tool, Worker node, and Crawl types |
| `update_node` | `id`, `data` | Merges `data` into the node: objects merge, arrays and scalars replace, `null` removes a key |
| `rename_node` | `id`, `newId` | Changes a node id and rewrites edges and `{{ id.output }}` refs in other nodes. Start cannot be renamed |
| `remove_node` | `id`, optional `reconnect` | Removes the node and its edges. With `reconnect: true`, a node with exactly one incoming and one outgoing edge is bypassed |
| `connect` | `from`, `to`, optional `handle`, `replace` | Adds an edge. A non-Classifier node has one outgoing edge; pass `replace: true` to move it |
| `disconnect` | `from`, optional `to`, `handle` | Removes every edge from `from` that matches `to` and `handle` |
| `move_node` | `id`, `position: {x, y}` | Moves a node on the canvas |

Rules:

- New ids match `^[A-Za-z][A-Za-z0-9_-]{0,63}$` and cannot reuse a Start input name. Omit `id` to get one from the type's prefix.
- `handle` is only for a Classifier source: an option id or one of `__uncertain`, `__blocked`, `__error`. The `source-` prefix is optional. A new Classifier added with `to` needs `to.handle`.
- Edges never target Start or leave Answer. `insert_node` needs `handle` when two edges join the same pair of nodes.
- Refs use `{{ nodeId.output }}` for node outputs and bare names (`user_input`, `files`, Start inputs) for Start values. A ref must point to a node that runs before this one.
- Call `worker_node_catalog` with a `type` for each node's fields and defaults before writing `data`.

## Examples

The examples start from the `chat` template: `start → llm-1 → answer-1`.

### Search Knowledge before the AI Node

Find the Knowledge id with `memo_list`, then:

```json
{"flowId":"<ID>","baseVersion":4,"dryRun":true,"ops":[
  {"op":"insert_node","type":"memoNode","id":"kb","data":{"rag_id":"<KNOWLEDGE-ID>"},"between":{"from":"start","to":"llm-1"}},
  {"op":"update_node","id":"llm-1","data":{"template":"Answer using only this context:\n{{ kb.context }}"}}
]}
```

Review `changes` and `warnings`, then repeat without `dryRun`.

### Route with a Classifier and two branches

```json
{"flowId":"<ID>","baseVersion":5,"ops":[
  {"op":"disconnect","from":"start","to":"llm-1"},
  {"op":"add_node","type":"classifierNode","id":"route","data":{
    "question":"Is the user asking about pricing?",
    "options":[
      {"id":"pricing","label":"Pricing","criteria":"Asks about prices, plans, or quotes"},
      {"id":"other","label":"Other","criteria":"Anything else"}
    ]},
    "from":{"node":"start"},"to":{"node":"llm-1","handle":"pricing"}},
  {"op":"add_node","type":"answerNode","id":"answer-other","from":{"node":"route","handle":"other"}},
  {"op":"connect","from":"route","to":"answer-other","handle":"__error"}
]}
```

Each option needs its own edge. Connecting `__error` routes classifier failures; without it you get a warning.

### Replace an inline header with a Vault secret

After the user stores the value with `secret_set` as `CRM_API_KEY`:

```json
{"flowId":"<ID>","baseVersion":6,"ops":[
  {"op":"update_node","id":"api-1","data":{"headers":{"Authorization":"Bearer {{ secrets.CRM_API_KEY }}"}}}
]}
```

Never write the credential value itself in `data`.
