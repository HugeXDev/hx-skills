# SQLite-backed artifact API

Use these files when data must survive a reload. Write them through `artifact_write` against a freshly read `activeVersion`. This example uses native browser APIs, so no library is needed.

`artifact.json`:

```json
{"title":"Items","libs":[],"theme":"none"}
```

`index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Items</title>
</head>
<body>
  <main>
    <h1>Items</h1>
    <form id="form">
      <label>Label <input id="label" maxlength="200" required></label>
      <button>Add</button>
    </form>
    <p id="status" role="status"></p>
    <ul id="items"></ul>
  </main>
  <script type="module" src="./app.js"></script>
</body>
</html>
```

`app.js`:

```js
const form = document.querySelector("#form");
const label = document.querySelector("#label");
const status = document.querySelector("#status");
const items = document.querySelector("#items");
async function refresh() {
  const response = await fetch("api/items");
  if (!response.ok) throw new Error("Unable to load items");
  const rows = await response.json();
  items.replaceChildren(...rows.map(row => {
    const li = document.createElement("li");
    li.textContent = row.label;
    return li;
  }));
}
form.addEventListener("submit", async event => {
  event.preventDefault();
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch("api/items", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({label: label.value}),
    });
    if (!response.ok) throw new Error("Unable to save item");
    label.value = "";
    await refresh();
    status.textContent = "Saved";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});
refresh().catch(error => { status.textContent = error.message; });
```

`server.js`:

```js
import { ArtifactApp } from "./artifact-app.js";

export class App extends ArtifactApp {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
  }

  async fetch(request) {
    const {pathname} = new URL(request.url);
    if (pathname === "/api/items" && request.method === "GET") {
      return Response.json(this.ctx.storage.sql.exec(
        "SELECT id, label, created_at FROM item ORDER BY id DESC"
      ).toArray());
    }
    if (pathname === "/api/items" && request.method === "POST") {
      let body;
      try { body = await request.json(); }
      catch { return Response.json({error: "Invalid JSON"}, {status: 400}); }
      const label = typeof body?.label === "string" ? body.label.trim() : "";
      if (!label || label.length > 200) {
        return Response.json({error: "Label must be 1–200 characters"}, {status: 400});
      }
      this.ctx.storage.sql.exec("INSERT INTO item (label) VALUES (?)", label);
      return Response.json({ok: true});
    }
    return new Response("Not found", {status: 404});
  }
}
```

After saving an item in the browser, verify it with `artifact_query`:

```json
{"slug":"<ARTIFACT-SLUG>","sql":"SELECT id, label, created_at FROM item ORDER BY id DESC LIMIT 20"}
```

Inspect `artifact_logs` after the interaction. Keep schema changes additive and compatible with older code: rolling back code leaves these rows and the new schema in place. This minimal API follows the artifact's access model; add application-level validation and authorization when the requested data model needs narrower access.
