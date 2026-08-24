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

CLI 与 Web App 共享工程 schema、默认工程和素材目录，但运行时存储不同：CLI 默认读写 `rooma.project.json`，Web 读写浏览器 localStorage。所有长度使用米，Y 轴旋转使用角度。

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

写操作通过工程锁串行化，使用 journal 恢复工程文件与历史文件的未完成提交，并保留最多 100 步 `undo` / `redo` 历史。`batch` 会把一句自然语言中的多项修改合并为一个可整体撤销的事务。配置共享 `ROOMA_HISTORY_DIR` 时，历史文件名包含工程绝对路径摘要，不同目录的同名工程不会共用历史。

`url` 会把完整工程编码为 `#project=...`。Web App 将它作为一次性快照导入本地工作副本，备份已有本地草稿并从地址栏移除快照 hash；导入后的 Web 编辑刷新不会回退到旧快照。CLI 文件与已打开的浏览器标签不会自动双向同步。

## Production CI/CD

推送到 GitHub `main` 后，`.github/workflows/deploy-production.yml` 会依次执行依赖安装、lint、完整测试与构建，通过后部署到 `rooma-3d-editor` Worker，并访问 `https://rooma-3d-editor.ron-nextop.workers.dev/` 验证生产页面。

GitHub 仓库必须配置 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN` 两个 Actions Secrets。API Token 只授予目标 Cloudflare 账户的 Workers Scripts Edit 权限，不要写入仓库、日志或普通环境变量。

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
