# AGENTS.md

本文件适用于仓库根目录及全部子目录。若以后某个子目录出现更具体的 `AGENTS.md`，以更深层文件为准。

## 项目定位

ROOMA 是面向室内设计者与业主的轻量 3D 布局编辑器。核心体验是：在浏览器中放置参数化家具/卫浴对象，切换 2D、3D、等轴测视图，直接编辑位置、旋转、尺寸和六向净距，并把同一工程通过 CLI 或 Codex 自然语言操作。

产品和视觉决策先读：

- `PRODUCT.md`：用户、能力边界与产品原则。
- `DESIGN.md`：完整设计系统。关键视觉是白色制图纸、单色建筑线稿、少量同色填充，而不是写实材质或卡片式后台。
- `README.md`：安装、CLI、Sites/Cloudflare 说明。

不要虚构客户、性能数字、模型库覆盖范围或尚未实现的导入/云保存能力。自定义 GLB/glTF 导入按钮目前是禁用占位；D1、R2 和 ChatGPT 登录帮助器也只是可选基础设施，不是当前编辑器的主数据链路。

## 技术栈与目录

- Node.js `>=22.13.0`，npm，ESM；不要改用其他包管理器或生成另一份锁文件。
- React 19 + TypeScript 5.9 + Next App Router API，由 Vinext/Vite 构建并运行在 Cloudflare Workers。
- Three.js 负责 WebGL 场景、相机、OrbitControls 和 TransformControls。
- Node 内置 test runner 负责测试；ESLint 9 负责静态检查。
- Drizzle + D1 是可选能力，当前 `.openai/hosting.json` 中 `d1`、`r2` 均为 `null`。

主要位置：

- `app/page.tsx`：客户端编辑器和 Three.js 场景，目前是主要集成点。
- `app/globals.css`：编辑器布局、设计 token、响应式与交互样式。
- `app/layout.tsx`：页面 metadata 和根布局。
- `app/chatgpt-auth.ts`：可选的 Sites/ChatGPT 身份头帮助器，当前主页未使用。
- `lib/project.ts`：浏览器工程类型、容错归一化、hash 编解码和 localStorage 持久化。
- `lib/engine/spatial.ts`：纯函数空间测量与净距移动计算。
- `lib/engine/parametric.ts`：参数化素材目录、尺寸限制与格式化。
- `lib/engine/render-scheduler.ts`：按需渲染和阴影刷新调度。
- `cli/rooma.mjs`：CLI 参数解析和命令分发。
- `cli/core.mjs`：严格工程校验、对象解析、边界/净距和 URL 编码。
- `cli/storage.mjs`：原子 JSON 写入及 100 步 undo/redo 历史。
- `rooma.assets.json`：Web 与 CLI 共享的素材目录和尺寸上下限。
- `rooma.default-project.json`：Web fallback 与 CLI `reset` 的基线工程。
- `rooma.project.json`：CLI 默认操作的工作工程，不是浏览器运行时直接读取的文件。
- `tests/`：SSR 外壳、空间引擎、参数化引擎、渲染调度和 CLI 测试。
- `worker/index.ts`、`vite.config.ts`：Vinext/Cloudflare Worker 入口与本地绑定模拟。
- `db/`：当前为空的可选 D1 层；`examples/d1/` 只是示例，不会自动成为活动路由。

## 工程状态的数据流

这部分是最容易误判的地方。

浏览器加载顺序是：

1. URL hash 中的 `#project=<base64url>`；
2. localStorage 的 `rooma.project.v1`；
3. 编译进应用的 `rooma.default-project.json`。

hash 中的工程加载后会写入 localStorage。hash 变化会触发整页 reload。浏览器内的编辑继续只写 localStorage。

CLI 默认直接读写仓库根目录的 `rooma.project.json`。CLI 写操作会原子替换工程文件，并在同目录维护 `rooma.project.json.history.json`；`url` 或写操作返回的 `openUrl` 才是把 CLI 工程送进 Web App 的桥梁。因此：

- 修改 `rooma.project.json` 不代表一个已打开的浏览器标签已经显示了该布局。
- 仅启动本地站点也不会让它自动读取 `rooma.project.json`。
- 验收 CLI 布局时，使用 `npm run rooma -- url --base <本地或线上地址>` 生成的完整 hash URL，并确认页面实际加载了目标对象和状态。
- 不要把 `rooma.project.json.history.json` 当成产品源文件提交，除非用户明确要求保存历史。
- 变更 schema、素材或归一化规则时，要同步核对 Web 的宽松 `normalizeRoomaProject` 和 CLI 的严格 `validateProject`；二者目的不同，不能只改一边。

## 坐标与空间约定

- 所有长度单位为米；`rotationY` 存储角度，Three.js 场景内部再转弧度。
- 房间以原点为中心：X 范围为 `[-width/2, width/2]`，Z 范围为 `[-depth/2, depth/2]`，Y 范围为 `[0, height]`。
- X 正方向向右，Z 正方向向房间前方，Y 正方向向上；所以“左后方”是负 X、负 Z。
- 对象 `position.x/z` 是平面中心，`position.y` 是对象底部高度。
- CLI 的旋转后边界使用 XZ 平面的轴对齐包围盒；Web 使用 Three.js `Box3`。调整空间算法时要保持两端语义一致并补测试。
- 六向净距只比较在另外两个轴上发生重叠的候选物体，否则参照对象是房间墙/地面/顶面。
- `validate` 只验证 schema、字段类型、唯一 ID、受支持素材和素材尺寸范围。它不检查物体碰撞，也不把超出房间边界作为验证错误；`object add/update` 只会对越界给 warning。因此 `valid: true` 是必要条件，不是空间布局验收结论。

## Web 编辑器不变量

- 保持按需渲染：通过 `RenderScheduler.invalidate()` 合并帧，只在 OrbitControls 阻尼仍在变化时续帧。不要恢复常驻动画循环。
- 只有几何/光照相关变化才将阴影标脏；`renderer.shadowMap.autoUpdate` 应保持关闭。
- DPR 目前上限为 1.5；几何体和边线几何体有缓存。改动高频路径时不要无意重新引入每帧分配。
- 对象尺寸是语义尺寸。通过 `buildParametric`/`rebuildObject` 重建构件，避免简单非均匀 scale 拉坏构件比例。
- 每次移动、旋转、重建、复制或删除后，维护 `selectable`、`pickTargets`、`boundsCache`、选择态、测量层和持久化状态的一致性。
- 2D 和 ISO 使用正交相机且禁止自由旋转；3D 使用透视相机。切换相机后同时更新 OrbitControls 和 TransformControls。
- 单指触摸用于点选；双指用于平移/缩放。不要让单指拖动误移动相机。
- Web undo/redo 是当前会话内的对象变换/尺寸快照，和 CLI 文件历史不是同一个系统。不要声称它能恢复所有新增、复制或删除操作，除非实现和测试已经扩展。
- `useEffect` 清理必须完整移除事件、ResizeObserver、定时器、controls、Three.js geometry/material/texture、renderer 和 DOM canvas，避免 HMR/路由切换泄漏。
- 键盘事件必须忽略 button/input/textarea/select/contenteditable 内的输入；保留可见 focus、ARIA label/pressed/shortcut 和键盘操作。
- 视觉改动遵守 `DESIGN.md`：模型画布优先、白色主体、单色边线、整套颜色模式协同变化。不要引入渐变、写实纹理或压缩画布的卡片仪表盘。
- 响应式行为至少覆盖桌面、`<=980px` 和 `<=760px`；小屏目录与检查器不能同时遮住主要画布。

## CLI 修改规则

- 自动化调用优先加 `--json`，以退出码和 `ok`/`error.code` 判断结果，不要解析人类输出。
- 操作非根目录工程时始终显式使用 `--file <path>`。测试和试验必须用临时副本，不要拿用户的 `rooma.project.json` 做破坏性演练。
- 写入前先用 `status`、`object list`、`object inspect` 和 `assets` 获取当前事实。名称匹配不唯一时使用稳定 ID。
- 一句请求包含多项写操作时优先使用 `batch --commands ...`，让它们成为单个可撤销事务。batch 内不能包含读取命令、历史命令、reset 或嵌套 batch。
- 保持写入原子性、严格校验、结构化错误和非零退出码；失败不得留下半写 JSON 或临时文件。
- 自然语言空间操作需要先换算为本项目坐标，再执行；不要要求用户补绝对坐标，除非空间关系确实无法从当前房间和对象状态解析。
- 写操作后至少运行 `validate --json`，再生成 `url --json`。如果出现 `valid:false`、非零退出或 warning，先解释/处理，不能直接宣称完成。
- 分享布局前还要在完整 hash URL 中做可视确认；`validate`、URL 生成成功或 HTTP 200 都不能替代真实交互验收。
- `ROOMA_APP_URL` 可覆盖默认线上地址，`ROOMA_HISTORY_DIR` 可把历史移到别处。不要硬编码个人绝对路径进产品代码。

## 开发与验证命令

首次安装或锁文件变化后：

```bash
npm ci
```

常用命令：

```bash
npm run dev
npm run build
npm run lint
npm test
npm run test:cli
npm run bench:spatial
npm run rooma -- status --json
npm run rooma -- validate --json
```

验证应按改动范围选择，但不要用更窄的检查代替必要的端到端验收：

- 文档或静态元数据：至少确认相关命令/路径真实存在；涉及页面 metadata 时跑 `npm test`。
- `lib/engine/spatial.ts`：跑 `tests/spatial.test.ts`；性能敏感改动再跑 `npm run bench:spatial`。
- `lib/engine/parametric.ts` 或 `rooma.assets.json`：跑参数化测试、CLI 测试和完整构建；新增素材还要实现 `buildParametric` 的视觉形体。
- `RenderScheduler` 或 Three.js 生命周期：跑 scheduler 测试、完整测试，并在真实浏览器中检查交互和控制台。
- CLI/core/storage/schema：跑 `npm run test:cli` 和 `npm test`，再对临时工程验证 JSON 输出、失败退出码、undo/redo 和 hash URL。
- `app/page.tsx`/CSS/交互：跑 `npm run lint` 与 `npm test`，再启动 `npm run dev`，实际操作选择、移动、旋转、尺寸、净距、撤销/重做、视图、颜色、标注、刷新持久化和窄屏布局，并确认控制台无新增错误。
- 部署相关：本地构建通过后仍需访问部署产物验证；构建成功、监听端口或首页 200 不能单独算部署验收。

`tests/rendered-html.test.mjs` 同时包含 SSR 断言和部分源码契约断言。若有意改变文案、DOM 结构或交互契约，要同步更新测试；不要为了过测试保留已经失真的 UI。当前 `npm test` 构建会提示客户端 chunk 大于 500 kB，这是已知非失败性警告；若改动明显增大 Three.js 客户端负载，应考虑拆分并记录前后变化。

## Cloudflare、Sites 与数据库

- 本项目没有 `wrangler.jsonc`；不要凭习惯新建。部署/本地绑定来自 `.openai/hosting.json`、`vite.config.ts` 和平台注入。
- `worker/index.ts` 除 Vinext handler 外只特判 `/_vinext/image`。新增 Worker 行为时保持普通请求继续交给 App Router。
- `db/schema.ts` 当前故意为空；只有功能确实需要持久数据库时才添加表、把 `.openai/hosting.json` 的 `d1` 设置为绑定名并运行 `npm run db:generate`。
- `examples/d1/` 是参考代码。不要把其中的 notes API 描述成现有产品功能，也不要直接依赖不存在的 `DB` binding。
- 身份头只代表 Sites/ChatGPT 身份，不自动代表 workspace 成员资格。保留 `returnTo` 的同源相对路径校验，不要实现平台保留的 `/signin-with-chatgpt`、`/signout-with-chatgpt`、`/callback` 路由。
- 只有用户明确要求时才部署或推送远端。部署后区分本地、已构建、已部署和已实际验收状态。

## 变更与 Git 纪律

- 开始前检查 `git status --short --branch`、现有 diff 和相关历史。工作区可能已有用户的工程布局或历史文件；保留它们，不要 reset、覆盖或顺手格式化。
- 只编辑任务所需文件。不要提交 `.next/`、`.vinext/`、`dist/`、`.wrangler/`、`outputs/`、`work/`、`*.tsbuildinfo`、环境文件或临时 CLI 历史。
- JSON 工程文件的纯格式化也会制造大 diff；只有任务需要改变该工程时才写它。
- 提交时只 stage 明确范围，并在交付中报告验证结果、剩余 warning、未提交用户改动和是否推送。用户说“提交本地”时只 commit，不 push。
- 不要用 build、健康检查、源码检查、登录页或监听端口替代用户请求的实际产品行为验收。

## 完成标准

交付前逐项确认：

1. 改动遵守产品/设计原则和上述数据流，不把 CLI 文件状态与浏览器状态混为一谈。
2. 类型、lint、相关单测和必要的完整 `npm test` 已通过；如未跑，明确说明原因。
3. 3D 或交互改动已在真实浏览器操作，包含刷新后的持久化和控制台检查。
4. CLI 工程改动已严格校验；布局合理性另经 `inspect`、warning 检查和页面可视确认。
5. 没有覆盖或提交用户原有的 `rooma.project.json`/history 等无关改动。
6. 最终说明区分已实现、已构建、已部署、已验收与尚未验证的部分。
