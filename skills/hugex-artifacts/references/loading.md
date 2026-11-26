# First view

`artifact.json` may set `loading`. Every field is optional. Without `loading`, the effective mode is `auto` and the overlay is the generic page (title, a status line, and a short skeleton). Tailwind and catalog scripts stay blocking: `defer` is applied only when `loading` is declared and its mode is not `none`. Colors follow `theme` (`hugex` or `none`) and `prefers-color-scheme`. The status line is chosen from `Accept-Language`: `es` is `Cargando…`; anything else is `Loading…`.

`page` is opt-in. A file named `loading.html` that the manifest does not name is served as a normal static file. It is not reserved.

```json
{"title":"My app","libs":[],"theme":"none","loading":{"mode":"manual","page":"loading.html"}}
```

```html
<main>
  <p>Loading…</p>
  <img src="./mark.svg" alt="">
</main>
```

## `page`

The path follows the same relative-path rules as other artifact files: no leading slash, backslash, or `.` / `..` segment. It must end in `.html`. It cannot be `index.html`, `server.js`, `artifact.json`, or anything under `__hx/`.

The file must exist in the version being published, and its UTF-8 must be at most 32 768 bytes. A write or an `artifact_publish` commit of new content rejects invalid `loading` (shape, path, or size), including a missing page or a page over that cap. Rolling back to an already published version is allowed even when its `loading` is invalid. At render time that invalid `loading` is ignored: `title`, `libs`, and `theme` still apply, and visitors see the generic overlay.

While batches are staged, the effective manifest is the one in the batch, otherwise the one already staged, otherwise the one in `baseVersion`, unless that file is an explicit deletion. The declared page's size is checked before the batch is stored.

The declared HTML is mounted in an iframe with `sandbox=""`: no scripts, no forms, and no same origin. Its CSS does not reach the app. Images must be a relative URL resolved against the artifact `<base>`, with no `crossorigin` attribute, or a `data:` URL. Do not put JavaScript, a form, or a cross-origin image in this file; none of those run.

## When the overlay leaves

`hx.ready()` is added beside `hx.worker` and does not replace it. Calling it more than once is safe. A call that happens before the overlay is installed is remembered, and the overlay is not shown.

| Mode | Overlay leaves | Cap | Warning |
| --- | --- | --- | --- |
| `auto` | on `load`, or sooner on `hx.ready()` | 10 s | `load not reached in 10s (auto)` |
| `manual` | only on `hx.ready()` | 15 s | `hx.ready() not called (manual)` |
| `none` | no overlay and no timer | — | — |

In a SPA, call `hx.ready()` after the first useful render (the first paint that shows real content, not an empty shell). A static page can omit the call and let `auto` wait for `load`. Use `manual` when `load` fires before that content exists. Use `none` when the page should appear immediately.

The cap warning is a `warn` log. Read it with `artifact_logs` (`level: "warn"` when that input is listed).
