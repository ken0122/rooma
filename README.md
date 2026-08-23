# ROOMA — 3D 室内布局设计

高性能、可参数化、可通过 Web UI、CLI 或 Codex 自然语言操作的 3D 室内布局设计工具。

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

## ROOMA CLI

CLI 与 Web App 使用同一份工程文档和素材目录：`rooma.project.json`、`rooma.default-project.json`、`rooma.assets.json`。所有长度使用米，Y 轴旋转使用角度。

```bash
npm run rooma -- status
npm run rooma -- assets --category bathroom
npm run rooma -- object list --json
npm run rooma -- object add sofa --label 会客沙发 --position 0,0,0
npm run rooma -- object update 会客沙发 --x 0.8 --rotation 90
npm run rooma -- object clearance 智能马桶 right 0.8
npm run rooma -- view set ISO
npm run rooma -- theme set green
npm run rooma -- measurements off
npm run rooma -- batch --commands '[["view","set","ISO"],["theme","set","green"]]'
npm run rooma -- validate
npm run rooma -- url
```

写操作使用原子文件替换，并保留最多 100 步 `undo` / `redo` 历史。`batch` 会把一句自然语言中的多项修改合并为一个可整体撤销的事务。`url` 会把完整工程编码为 `#project=...`，线上 Web App 可直接载入，无需为每次布局修改重新部署。

个人 Codex 插件安装在 `/Users/luokun/plugins/rooma-operator`。安装后可以直接说“把智能马桶向左移动 30 厘米并打开结果”或“增加一张双人床，改成绿色等轴测”。

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build and run Web App, geometry, renderer, and CLI tests
- `npm run test:cli`: run the deterministic CLI suite
- `npm run rooma -- <command>`: operate the current ROOMA project
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
