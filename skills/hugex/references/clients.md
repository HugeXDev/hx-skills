# Connect your assistant to HugeX

Use the canonical URL from **Artifacts → Connect MCP** in HugeX. In Spanish the
screen is **Conectar MCP**. If no URL is available, ask the environment's
administrator for it. Never infer it from another account's URL.

Explain each step in the user's language. Before each configuration change or
installation, describe the change and obtain approval. For file edits, show the
file, destination and replacements; preserve existing settings. A chat assistant
may need the user to operate settings themselves. Never claim to have changed
settings you cannot access.

## Sign-in and permissions

The client opens a browser for HugeX sign-in. The user signs in with their own
account, checks the assistant's identity and requested permissions, chooses what
to allow, and approves or cancels. An existing sign-in may skip the login form.
Return to the client after consent. Never ask for passwords or tokens in chat.

Recommend permissions for the user's goal:

| Goal | Request |
| --- | --- |
| Find available Workers | `workers:read` |
| Ask a Worker to do something | `workers:read`, `workers:run` |
| Inspect existing dashboards or mini-apps | `artifacts:read` |
| Build or change a dashboard or mini-app | `artifacts:read`, `artifacts:write` |
| Connect an existing Worker to a mini-app | `workers:read`, `artifacts:read`, `artifacts:write`; add `workers:run` for an approved execution test |
| Read Knowledge | `memos:read` |
| Inspect the environment's tools or skills | `tools:read` or `skills:read` respectively |
| Edit the environment's skills | `skills:read`, `skills:write` |
| Keep the connection available between sessions | Add `offline_access` only if wanted; sign-in is still required when the session expires |

At least one domain read permission is needed to connect. The public guide adds
no separate permission. For the onboarding verification, use `workers:read` or
`artifacts:read`. If the client requests more permissions than needed, deselect
unneeded choices on HugeX's consent screen. If a needed permission was not
requested, restart authorization with it. Account access still limits what the
assistant can see or change. Permission to run a Worker allows real effects;
confirm the intended operation before running it.

## Claude web or desktop

Use a remote custom connector; no local adapter is required.

1. In **Customize → Connectors**, choose **+ Add → Add custom connector**.
2. Name it `hugex`, enter the HugeX MCP URL, and continue. Review detected
   authentication; use OAuth sign-in rather than fixed credentials.
3. Choose **Sign in now**, add the connector and complete HugeX consent.
4. Enable it for the conversation using **+ → Connectors**.

In managed organizations, an owner may first need to add it under
**Organization settings → Connectors → Add → Custom → Web**. Members then
find it under their connectors and choose **Connect**. If the controls are
missing, ask the organization owner to enable access.

Source: [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).

## ChatGPT

ChatGPT supports remote MCP servers. Availability and management controls depend
on the account and organization; do not promise this option to every user.

1. Open **ChatGPT Plugins**, select **+ → Add custom MCP server**.
2. Enter a name (`hugex`) and description. Under **Connection**, enter the
   canonical HTTPS MCP URL, including its `/mcp` path. Configure OAuth.
3. Review the warning and choose **Create as a plugin**. Complete HugeX sign-in
   and consent when prompted, then review the discovered tools.
4. Install the resulting plugin. In a new conversation, type **@** and select it.

If these controls are unavailable, ask the workspace administrator about custom
MCP access or use another supported client. Pasting the setup message alone
does not give a conversation access to HugeX.

Source: [OpenAI connection guide](https://developers.openai.com/plugins/deploy/connect-chatgpt).

## Claude Code

After approval, replace the example URL and run:

```sh
claude mcp add --transport http hugex https://your-environment.example.com/mcp
```

In Claude Code, open `/mcp`, select `hugex` and follow authentication in the
browser. The default configuration scope is local to the current project;
explain the scope before adding it. Confirm it appears connected in `/mcp`.

Source: [Claude Code MCP](https://code.claude.com/docs/en/mcp).

## Codex

After approval, replace the example URL and run:

```sh
codex mcp add hugex --url https://your-environment.example.com/mcp
codex mcp login hugex
```

The first command changes the user's MCP configuration; the second opens OAuth
sign-in. Complete HugeX consent. Use `/mcp` in Codex to inspect the connection.
In the desktop app, the equivalent controls are **Settings → MCP servers →
Add server**: choose **Streamable HTTP**, enter `hugex` and the canonical URL,
save and restart, then choose **Authenticate** when sign-in is required.

Source: [Codex MCP](https://developers.openai.com/codex/mcp).

## Cursor

After showing the destination and obtaining approval, merge this entry into
Cursor's MCP configuration; preserve other servers. Choose project or personal
scope with the user: `.cursor/mcp.json` in the project or `~/.cursor/mcp.json`
for their account.

```json
{
  "mcpServers": {
    "hugex": { "url": "https://your-environment.example.com/mcp" }
  }
}
```

Replace the example URL before saving. Restart Cursor if needed, open its MCP
controls under **Customize**, and follow OAuth authentication for `hugex`.

Sources: [Cursor MCP](https://cursor.com/docs/mcp),
[manual setup](https://cursor.com/help/customization/mcp).

## Another client

Check the client's official instructions for **remote Streamable HTTP with
OAuth**. With approval, add a server named `hugex` using the canonical URL,
let the client discover authentication, and complete HugeX consent. A client
supporting only local command-based servers cannot connect directly this way;
explain that limitation and suggest a supported client instead of inventing an
adapter installation.

Protocol reference: [MCP authorization](https://modelcontextprotocol.io/specification/latest/basic/authorization).

## Check the connection

Call `worker_list` with `{}` when `workers:read` is granted, or `artifact_list`
with `{}` when `artifacts:read` is granted. Summarize what is visible; an empty
list is a valid result. Do not run a Worker or publish an app as a connection
test. If connection fails, state the observed problem and one next step without
claiming success. For missing permissions, repeat consent; for unavailable
objects, check the selected account, environment and access.
