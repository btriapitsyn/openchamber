# @openchamber/sdk

Build extensions for [OpenChamber](https://openchamber.dev). An extension is a small web page that OpenChamber shows on its right-hand rail. It can read the current project and session, show toasts, put text in the chat box, attach a task to a session, and, once the user approves it, start sessions and send prompts. This package is the contract between that page and the app.

Full guide: [Build an extension](https://openchamber.dev/docs/sdk/). Reference: [Host API](https://openchamber.dev/docs/sdk/host/) and [UI kit](https://openchamber.dev/docs/sdk/ui/). Extensions with a local process: [GUEST_SERVICES.md](./GUEST_SERVICES.md).

Extensions load in OpenChamber web and desktop. VS Code and mobile do not load them yet.

## Install

```bash
npm install @openchamber/sdk
```

The package ships compiled JavaScript with type declarations, so any bundler works. Its version matches the OpenChamber release it shipped with, so `@openchamber/sdk@1.24.0` is the contract of OpenChamber 1.24.0.

## What you ship

A folder with three files:

- `package.json` with an `openchamber` block (the manifest)
- `panel/index.html`, the page OpenChamber shows
- `panel/main.js`, your script built into one classic file (an IIFE; the page runs in a sandboxed iframe and cannot load ES modules)

OpenChamber never compiles your code. Build `panel/main.js` yourself. The package includes a bundler command that runs on Bun; esbuild with `--format=iife --platform=browser` does the same job.

```bash
bunx openchamber-guest-bundle panel/main.ts panel/main.js
```

Then install the folder from Settings → Extensions → Add. Folder installs run from your folder, so edit, rebuild, and reload. A `.zip` or an https git or zip link is copied into OpenChamber's data folder instead; ship the built files only.

A complete three-file example is on the [Build an extension](https://openchamber.dev/docs/sdk/) page. Four more are at [github.com/openchamber/openchamber/tree/main/packages/sdk/examples](https://github.com/openchamber/openchamber/tree/main/packages/sdk/examples).

## Manifest

```json
{
  "name": "@acme/hello",
  "version": "1.0.0",
  "openchamber": {
    "apiVersion": 1,
    "engines": { "openchamber": ">=1.24.0" },
    "contributes": {
      "panel": {
        "id": "acme-hello",
        "name": "Hello",
        "icon": "window",
        "entry": "panel/index.html"
      },
      "attach": "dialog",
      "capabilities": ["prompt", "sessions"],
      "integration": {
        "name": "Acme",
        "description": "Tasks from Acme",
        "token": {
          "apiOrigin": "https://api.acme.example",
          "account": { "path": "/me", "name": "login" },
          "scheme": "bearer"
        },
        "settings": [{ "id": "list-id", "label": "List ID" }]
      }
    }
  }
}
```

- `version` is required semver. Settings → Extensions shows it on the card.
- `apiVersion` is `1`. Anything else is refused.
- `engines.openchamber` is optional (`1.24.0` or `>=1.24.0`). Older OpenChamber builds refuse the install.
- `panel.id` is kebab-case and unique. `icon` is a Remixicon name (`RiWindowLine` becomes `window`) or an SVG inside the folder. `entry` is the HTML file inside the folder.
- `attach` is optional. `"dialog"` opens the page in a window from the + menu next to the chat box; `true` or `"panel"` opens the rail panel instead. `ctx.surface` tells the page which one it is in. The object form `{ "mode": "dialog", "entry": "panel/attach.html" }` gives the window its own page. When the user clicks the attached chip, the page opens again with that item in `ctx.item` (`null` from the + menu), so it can show the item instead of the list.
- `capabilities` lists what needs the user's approval: `prompt` to send messages, `sessions` to create sessions and worktrees, `files` to read and write inside the open project. An `integration` adds `network`, a `service` adds `service`, and `filesystem` patterns (like `["~/.config/opencode/opencode.json"]`) add `filesystem`, which lets `readFile`, `writeFile`, `listDir`, and `stat` reach those paths outside the project. The user approves the whole list once at install. Calls outside it fail with `NOT_GRANTED`.
- `integration` is optional. It adds a card at Settings → Integrations. `token` takes a pasted API token (`scheme: "bearer"` for `Authorization: Bearer`, `"basic"` for a username and token pair as Jira Cloud wants), `oauth` runs an authorize flow with a pasted client id, and `host: { "provider": "linear" }` reuses the Linear account already connected in OpenChamber. The page never sees the token; OpenChamber makes the calls through `host.request`.
- `service` is optional. It declares a local process OpenChamber starts next to the extension. See [GUEST_SERVICES.md](./GUEST_SERVICES.md).

## In the page

```ts
import { connectHost, HostRequestError } from '@openchamber/sdk';

const host = connectHost();

host.onReady((ctx) => {
  document.body.dataset.theme = ctx.theme.mode;
});

host.onSession((session) => {
  document.querySelector('#session')!.textContent = session?.title ?? '';
});

try {
  const user = await host.request({ method: 'GET', path: '/me' });
} catch (error) {
  if (error instanceof HostRequestError && error.code === 'DISCONNECTED') {
    await host.oauthStart();
  }
}

await host.toast({ kind: 'info', message: 'Hello' });
await host.compose({ text: 'Ask about the latest diff' });
await host.attach({
  providerId: 'acme-hello',
  id: 'TICKET-1',
  title: 'Login is broken',
  url: 'https://example.com/TICKET-1',
});
await host.startSession({
  providerId: 'acme-hello',
  id: 'TICKET-1',
  title: 'Login is broken',
  url: 'https://example.com/TICKET-1',
  worktree: true,
  text: 'Optional first message',
});
await host.prompt({ text: 'Fix the login', send: true });
```

Every method, its limits, and the error codes are on the [Host API](https://openchamber.dev/docs/sdk/host/) page.

## UI kit

`@openchamber/sdk/ui` has buttons, fields, a searchable dropdown, checkboxes, tabs, badges, lists, empty states, spinners, banners, separators, progress bars, menus, and safe text, all drawn with the app's colours and fonts. Call `applyHostReady` from `onReady` first, then mount what you need. Every mount returns `{ update, dispose }`.

```ts
import { applyHostReady, mountList } from '@openchamber/sdk/ui';

host.onReady((ctx) => {
  applyHostReady(ctx, document.documentElement);
  mountList(document.querySelector('#root')!, {
    items: tasks.map((task) => ({ id: task.id, leading: task.key, title: task.title })),
    onSelect: (id) => {
      const task = tasks.find((item) => item.id === id);
      if (task) void host.attach({ providerId: 'acme-hello', id, title: task.title, url: task.url });
    },
  });
});
```

## Schemas

`@openchamber/sdk/schemas` exports the zod schemas for the manifest and the messages, for tools that validate extensions. The main entry has no zod dependency, so a page bundle stays small.

## Scope

This package covers the page, the manifest, the messages, and the UI kit. It does not give an extension files, the terminal, git, or OpenChamber's React tree. `apiVersion` 1 is frozen; new methods arrive with the app's releases and this package's version.
