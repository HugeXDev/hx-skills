# Minimal Worker chat and form

Choose one path; these are files to publish after creating an artifact, not extra `artifact_create` template names. Replace `<CONFIRMED-WORKER-ID>` with an ID obtained through `worker_list` / `worker_get`. Have the artifact owner grant that Worker through `artifact_workers` before testing either example. Both examples render responses as text.

## A. Browser streaming chat

Use `template: "blank"` when creating the artifact, then replace these three files. No `server.js` is required. The Worker runs with the visitor's access, including login for a private Worker. Callback data may include reasoning and runtime events; show only information appropriate for the audience.

`artifact.json`:

```json
{"title":"Worker chat","libs":[],"theme":"none"}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Worker chat</title>
</head>
<body>
  <main>
    <h1>Worker chat</h1>
    <p id="status" role="status">Connecting…</p>
    <div id="messages" role="log"></div>
    <pre id="stream" style="white-space:pre-wrap"></pre>
    <form id="form">
      <label>Message <input id="message" required></label>
      <button id="send" disabled>Send</button>
    </form>
    <button id="clear" type="button" disabled>Clear conversation</button>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>
```

`app.js`:

```js
const FLOW_ID = "<CONFIRMED-WORKER-ID>";
const form = document.querySelector("#form");
const input = document.querySelector("#message");
const send = document.querySelector("#send");
const clear = document.querySelector("#clear");
const messages = document.querySelector("#messages");
const stream = document.querySelector("#stream");
const status = document.querySelector("#status");
let ready = false;
let busy = false;
function controls() {
  send.disabled = !ready || busy;
  clear.disabled = !ready || busy;
}
function append(role, text) {
  const p = document.createElement("p");
  p.textContent = `${role}: ${text}`;
  messages.append(p);
}
const client = window.hx.worker(FLOW_ID, {
  onConfig() {
    ready = true;
    status.textContent = busy ? "Replying…" : "Ready";
    controls();
  },
  onHistory(history) {
    messages.replaceChildren();
    if (Array.isArray(history?.messages)) {
      for (const item of history.messages) {
        append(item.role || "Worker", item.content || item.text || "");
      }
    }
  },
  onToken(token) { stream.textContent += token; },
  onMessage(text) {
    append("Worker", text);
    stream.textContent = "";
    busy = false;
    status.textContent = "Ready";
    controls();
  },
  onError() {
    ready = false;
    status.textContent = "Worker connection failed. Check access and grants, then reload.";
    controls();
  },
});
form.addEventListener("submit", event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!ready || busy || !text) return;
  busy = true;
  controls();
  status.textContent = "Replying…";
  stream.textContent = "";
  try {
    client.send(text);
    append("You", text);
    input.value = "";
  } catch {
    busy = false;
    ready = false;
    status.textContent = "Send failed. Reload after checking the connection.";
    controls();
  }
});
clear.addEventListener("click", () => {
  if (!ready || busy) return;
  client.clear();
  messages.replaceChildren();
  stream.textContent = "";
});
window.addEventListener("pagehide", () => client.close());
```

The helper also supports `onReasoning`, `onEvent`, and `client.auth(name, value)` for integration credentials. It reconnects automatically after a socket interruption using its existing session; `close()` stops reconnection. Do not send another turn while the outcome of a previous turn remains uncertain. The sample retains its busy state across a connection error until a final message arrives or the page reloads.

## B. Server-side form

Use `template: "process-form"` when creating the artifact, then replace these files. The server uses the artifact owner's access recorded by the grant, including for anonymous visitors. Confirm that this operation and audience are intended. Fix the Worker ID in server code; never accept it from a browser parameter. This sample deliberately starts a new Worker conversation per submission.

`artifact.json`:

```json
{"title":"Worker form","libs":[],"theme":"none"}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Worker form</title>
</head>
<body>
  <main>
    <h1>Ask the Worker</h1>
    <form id="form">
      <label>Request <textarea id="message" required maxlength="4000"></textarea></label>
      <button>Submit</button>
    </form>
    <p id="status" role="status"></p>
    <pre id="result" style="white-space:pre-wrap"></pre>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>
```

`app.js`:

```js
const form = document.querySelector("#form");
const message = document.querySelector("#message");
const status = document.querySelector("#status");
const result = document.querySelector("#result");
let busy = false;
form.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !message.value.trim()) return;
  busy = true;
  const button = form.querySelector("button");
  button.disabled = true;
  status.textContent = "Working…";
  result.textContent = "";
  try {
    const response = await fetch("api/ask", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({message: message.value.trim()}),
    });
    if (!response.ok) throw new Error("Unable to complete request");
    const data = await response.json();
    result.textContent = data.result.text;
    status.textContent = "Done";
  } catch {
    status.textContent = "Request failed. Check its outcome before trying again.";
  } finally {
    busy = false;
    button.disabled = false;
  }
});
```

`server.js`:

```js
import { ArtifactApp } from "./artifact-app.js";
const FLOW_ID = "<CONFIRMED-WORKER-ID>";

export class App extends ArtifactApp {
  async fetch(request) {
    if (new URL(request.url).pathname !== "/api/ask" || request.method !== "POST") {
      return new Response("Not found", {status: 404});
    }
    let body;
    try { body = await request.json(); }
    catch { return Response.json({error: "Invalid JSON"}, {status: 400}); }
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message || message.length > 4000) {
      return Response.json({error: "Request must be 1–4000 characters"}, {status: 400});
    }
    try {
      const result = await this.env.HX.ask(FLOW_ID, {message});
      return Response.json({ok: true, result});
    } catch {
      console.error("Worker request failed");
      return Response.json({error: "Unable to complete request"}, {status: 502});
    }
  }
}
```

For continuing conversations, `ask` accepts `sessionId` and optional `inputs` and returns `{text, sessionId}`. Retain the returned `art-<UUID>` per application user on the server, validate ownership, and allow one turn at a time; never mix visitors' sessions or reuse the MCP conversation. Use SQLite for persistence.

For either path, obtain `artifact_url`, test the chosen interaction, then read `artifact_logs`. Missing grants and inaccessible Workers intentionally produce generic connection/request errors. Publishing files does not prove the Worker interaction succeeded.
