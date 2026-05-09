# Cubox 化开发交接说明

> 面向后续接手本项目的子 agent。本文记录项目目标、已完成进度、下一阶段建议、关键代码入口和验证要求。

## 1. 项目目标

本阶段目标是在 Karakeep 现有书签、抓取、AI 推理、搜索和资产存储体系上，逐步补齐 Cubox 类产品体验：

- 中国/社交平台内容可稳定抓取：微信公众号、X、抖音、小红书。
- 抓取优先走平台适配器，失败时回退 Karakeep 原有通用抓取链路。
- 平台正文、封面、正文图片进入 Karakeep 资产体系，预览和阅读尽量不依赖原站图片热链。
- 中文内容有更好的 AI 自动标签。
- 后续补齐语义检索，让收藏内容可按语义召回。

总体原则：

- 最小侵入主链路，只在必要路由点扩展。
- 适配器放 worker 侧，避免把正文清洗、媒体转存、失败降级塞进 metascraper metadata plugin。
- 所有 AI 调用必须走 `packages/shared/inference.ts`。
- 所有 schema 改动必须走 Drizzle migration。
- 不提交本地 API key、cookie、`.env` 或用户私有数据。

## 2. 当前分支和发布状态

当前实现分支：

- 本地分支：`codex/cubox-m1-m2`
- fork 分支：`lichengtao97/karakeep:codex/cubox-m1-m2`
- Draft PR：`https://github.com/karakeep-app/karakeep/pull/2775`
- 已提交 commit：`31dc3fbc Add Cubox platform adapters and Chinese tagging`

当前本地仍有未纳入 PR 的用户资料：

- `docs/cubox/`：用户提供和后续新增的设计/交接文档目录。
- `apps/web/lib/i18n/locales/zh/translation.json`：用户既有未提交改动，不属于 Cubox M1/M2 代码实现。

后续 agent 不要默认 revert 或覆盖这些文件。

## 3. 已完成范围

### M1：适配器底座 + 微信公众号适配器

已完成：

- 新增 worker 侧平台适配器目录：`apps/workers/workers/adapters/`。
- 新增适配器 registry，支持按 URL 命中、按 priority 排序。
- 新增微信公众号适配器：
  - 命中 `mp.weixin.qq.com/s/*` 和 `mp.weixin.qq.com/s?*`。
  - HTTP 拉取 HTML，不强依赖浏览器。
  - 抽取 `#activity-name`、`#js_name`、`#publish_time`、`#js_content`。
  - OG title/description/image 作为兜底。
  - 清理正文 script/style/iframe/on* 事件属性。
- 在 `crawlAndParseUrl` 前置一个适配器路由点：
  - 命中适配器则优先用适配器结果。
  - 适配器失败记录日志和 metric，然后回退通用抓取。
  - 未命中适配器完全保留原逻辑。
- 新增统一抽取结果结构 `ExtractedContent`。
- 微信正文图片同步转存到 assetdb：
  - 下载请求带 `Referer: https://mp.weixin.qq.com/`。
  - 正文 HTML 中图片改写为 `/api/assets/{assetId}`。
  - 图片下载失败保留原 URL，不使 bookmark 整体失败。
- 微信封面图使用同一套带 Referer 下载逻辑。
- 新增 asset type：`LINK_INLINE_IMAGE`。
- 数据库扩展：
  - `bookmarkLinks.platform`
  - `bookmarkLinks.rawExtraction`
  - `bookmarkLinks.adapterVersion`
  - `adapterExtractionLog`
- 新增 adapter 指标：
  - `adapterExtractionCounter`
  - `adapterExtractionLatencyHistogram`
- 新增配置：
  - `ADAPTER_TIMEOUT_MS`
  - `ADAPTER_DEFAULT_RATE_LIMIT`
- 优化 worker 启动速度：
  - adblocker 改为真正需要 Playwright 页面时 lazy load。
  - 微信适配器 HTTP 抓取不再被 adblocker 初始化拖慢。

关键文件：

- `apps/workers/workers/adapters/types.ts`
- `apps/workers/workers/adapters/registry.ts`
- `apps/workers/workers/adapters/wechat.ts`
- `apps/workers/workers/crawlerWorker.ts`
- `apps/workers/metrics.ts`
- `packages/db/schema.ts`
- `packages/db/drizzle/0085_loving_sir_ram.sql`
- `packages/shared/config.ts`
- `.env.sample`
- `docs/docs/03-configuration/01-environment-variables.md`

### M2：中文 AI 打标增强

已完成：

- 新增中文文本打标 prompt。
- 触发条件：
  - `INFERENCE_LANG` / 用户设置为 `zh`、`zh-cn`、`zh-hans`、`chinese`、`中文`。
  - 或平台为 `wechat`、`weixin`、`xhs`、`xiaohongshu`、`douyin`。
- 将平台元数据注入 prompt：
  - `platform`
  - `author`
  - `publisher`
  - `rawExtraction` 中的受控摘要字段，例如 `imageCount`、`hasContentElement`
- 图片打标 prompt 支持注入已有 OCR 文本 `imageOcrText`。
- 新增中文标签同义词归一化，覆盖 30+ 高频组：
  - `AI` / `人工智能` / `机器学习` -> `人工智能`
  - `LLM` / `大模型` -> `大语言模型`
  - `Open Source` / `开源` -> `开源`
  - `Startup` / `创业` -> `创业`
- 中文内容或中国平台内容完成推理后会执行标签归一化。

关键文件：

- `packages/shared/prompts.ts`
- `packages/shared/prompts.server.ts`
- `packages/shared/prompts.test.ts`
- `apps/workers/workers/inference/tagging.ts`
- `apps/workers/workers/inference/tagNormalization.ts`
- `apps/workers/workers/inference/tagNormalization.test.ts`

## 4. 本地验证记录

已通过的聚焦验证：

```bash
npx pnpm@9.15.9 --filter @karakeep/workers run format
npx pnpm@9.15.9 --filter @karakeep/workers run lint
npx pnpm@9.15.9 --filter @karakeep/workers run typecheck
npx pnpm@9.15.9 --filter @karakeep/workers run test

npx pnpm@9.15.9 --filter @karakeep/shared run format
npx pnpm@9.15.9 --filter @karakeep/shared run lint
npx pnpm@9.15.9 --filter @karakeep/shared run typecheck
npx pnpm@9.15.9 --filter @karakeep/shared run test

npx pnpm@9.15.9 --filter @karakeep/db run typecheck
npx pnpm@9.15.9 --filter @karakeep/trpc run typecheck
```

已做过的手工验证：

- 本地启动 web + workers。
- 添加微信公众号文章。
- 验证 adapter 命中 `wechat`。
- 验证封面和正文图进入 assetdb。
- 验证正文 HTML 图片 URL 改写为 `/api/assets/{assetId}`。
- 验证 `bookmarkLinks.platform/rawExtraction/adapterVersion` 写入。
- 验证 `adapterExtractionLog` 写入成功记录。
- 接入 OpenAI 兼容的智谱端点后，验证 AI 标签可写入。

已知全量验证限制：

- 本地 root `pnpm typecheck` 曾被 `apps/landing` 阻塞，因为 Astro 要求 Node `>=22.12.0`，当前 shell 是 Node `20.17.0`。
- Docker 未运行时，Meilisearch/Chrome 相关回归不能完整覆盖。
- Search 当前本地未配置时，worker 日志会显示 `Search is not configured, nothing to do now`。

## 5. 本地运行参考

开发时使用的本地数据目录：

```bash
DATA_DIR=/tmp/karakeep-dev-data
```

web：

```bash
DATA_DIR=/tmp/karakeep-dev-data \
NEXTAUTH_SECRET=dev-secret \
NEXTAUTH_URL=http://localhost:3000 \
API_URL=http://localhost:3000 \
NO_COLOR=false \
npx pnpm@9.15.9 --filter @karakeep/web run dev
```

workers：

```bash
DATA_DIR=/tmp/karakeep-dev-data \
NEXTAUTH_SECRET=dev-secret \
NEXTAUTH_URL=http://localhost:3000 \
API_URL=http://localhost:3000 \
NO_COLOR=false \
npx pnpm@9.15.9 --filter @karakeep/workers run start
```

如果需要验证 AI 打标，可使用 OpenAI 兼容 provider。不要把 key 写进仓库文件。运行时环境变量示例：

```bash
OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
INFERENCE_TEXT_MODEL=glm-4.7
INFERENCE_IMAGE_MODEL=glm-4.6v
INFERENCE_OUTPUT_SCHEMA=json
INFERENCE_LANG=zh
INFERENCE_MAX_OUTPUT_TOKENS=8192
INFERENCE_JOB_TIMEOUT_SEC=120
```

## 6. 后续阶段建议

### M3：X / Twitter 适配器

建议目标：

- 命中 `x.com/*/status/*`、`twitter.com/*/status/*`。
- 优先抽取 tweet 文本、作者、发布时间、媒体图。
- 无登录场景先覆盖公开 tweet。
- 登录/cookie 支持后置，避免过早引入凭据表。
- 失败时回退通用抓取。

建议文件：

- 新增 `apps/workers/workers/adapters/x.ts`
- 新增 `apps/workers/workers/adapters/x.test.ts`
- 注册到 `apps/workers/workers/adapters/registry.ts`

验收：

- URL match 单测。
- fixture 解析单测。
- 多图媒体列表非空。
- 适配器失败回退通用链路。

### M4：抖音适配器

建议目标：

- 命中 `douyin.com` 常见分享链接和短链解析后的视频/图文链接。
- 先支持公开页面元数据、标题、作者、封面、正文/描述。
- 视频下载继续沿用现有 video worker，不在适配器里做大文件下载。
- 如果需要浏览器渲染，复用 crawler worker 的 Playwright 路径，不新增独立浏览器池。

风险：

- 短链跳转、反爬、移动端 HTML 差异。
- 需要明确超时和失败降级策略。

### M5：小红书适配器

建议目标：

- 命中 `xiaohongshu.com`、`xhslink.com`。
- 支持图文笔记：标题、作者、正文、话题、封面、图片列表。
- 小红书可能需要 cookie，凭据管理可在此阶段启动。

可能需要新增：

- `platform_credentials` 或等价凭据存储。
- 设置页入口。
- 凭据加密和日志脱敏。

不要在 M3/M4 提前做小红书 cookie 架构，避免过度设计。

### M6：媒体异步管线

触发条件：

- 如果微信/小红书长图文同步下载导致 P95 超过目标，再做。

建议目标：

- 主链路先写卡片、正文和原始图片 URL。
- 图片下载迁入独立 worker。
- 下载完成后更新 HTML 或维护映射表。
- 不破坏当前同步下载的阅读稳定性。

### M7：语义检索

建议目标：

- 在 `packages/shared/inference.ts` 增加 embedding 接口。
- 新增内容 chunk、embedding 存储和重建 worker。
- 搜索 API 保持 BM25 路径不变，新增 semantic procedure。
- 融合检索可使用 RRF。

注意：

- 向量存储优先评估 SQLite 方案。
- 不要直接绕过现有 inference provider 体系调用外部 API。

## 7. Agent 开发规则

后续 agent 接手前必须做：

```bash
git status -sb
git branch --show-current
```

如果看到以下文件改动，不要默认处理，除非用户明确要求：

- `apps/web/lib/i18n/locales/zh/translation.json`
- `docs/cubox/*`

每个阶段的最小交付要求：

- 新适配器必须有 URL match 测试和 fixture 解析测试。
- 新数据库字段必须有 migration。
- 新 env 必须同步 `.env.sample`、`serverConfig`、配置文档。
- 新外部请求必须考虑 SSRF、防超时和失败降级。
- 新 AI 能力必须走 `packages/shared/inference.ts`。
- 不允许把用户 cookie/API key 写入日志、测试 fixture 或文档。

推荐验证顺序：

```bash
npx pnpm@9.15.9 --filter @karakeep/workers run format
npx pnpm@9.15.9 --filter @karakeep/workers run lint
npx pnpm@9.15.9 --filter @karakeep/workers run typecheck
npx pnpm@9.15.9 --filter @karakeep/workers run test
```

涉及共享包时追加：

```bash
npx pnpm@9.15.9 --filter @karakeep/shared run format
npx pnpm@9.15.9 --filter @karakeep/shared run lint
npx pnpm@9.15.9 --filter @karakeep/shared run typecheck
npx pnpm@9.15.9 --filter @karakeep/shared run test
```

涉及 DB/API 时追加：

```bash
npx pnpm@9.15.9 --filter @karakeep/db run typecheck
npx pnpm@9.15.9 --filter @karakeep/trpc run typecheck
```

## 8. 当前优先级建议

推荐下一位 agent 优先做：

1. M3 X / Twitter 适配器：与 M1 适配器底座最直接衔接，风险中等。
2. M5 小红书凭据设计草案：先做 schema/设置入口设计评审，不急着写复杂抓取。
3. M7 语义检索技术 spike：评估 SQLite 向量方案和 embedding provider 接口。

不建议立刻做：

- 大规模 UI 重构。
- 独立媒体异步管线，除非有明确 P95 数据证明同步下载不可接受。
- 绕开现有 queue/inference/search 抽象的新基础设施。

