# Cubox 化扩展 — 总览

> 本套文档把 Karakeep → Cubox 化的工作拆成多个**可并行交付的工作包**，每份子文档对应一个或一组可独立开发、独立验收的能力。
>
> 每个 agent 拿到一份子文档即可独立工作；总览只负责对齐目标、边界、并行依赖。

## 1. 目标

在 Karakeep（Next.js + tRPC + Drizzle/SQLite + Playwright + Meilisearch）基础上，新增三类能力：

1. **社交/中国平台秒级抓取**：X、微信公众号、抖音、小红书
2. **中文 AI 打标增强**
3. **语义检索（RAG 检索，不含问答）**

> 验收以「主流图文链接 3 秒内呈现卡片 + 标签 + 可被语义检索」为体感目标。

## 2. 设计原则

1. **最小侵入**：不改 Karakeep 核心调度链，新能力以适配器/插件/独立 worker 形态加入
2. **复用已有抽象**：Playwright 浏览器池、`inference.ts`、Meilisearch、`metascraper-plugins/`、`assetdb`、规则引擎，**禁止造重**
3. **不引新基础设施**：除非明确论证，向量化方案优先复用 SQLite（推荐 [`sqlite-vec`](https://github.com/asg017/sqlite-vec)）
4. **每个适配器自治**：独立目录、独立黄金集、独立超时/重试、独立 cookie 配置
5. **AGPL 合规**：保留上游许可声明，衍生开源

## 3. 推荐技术选型

| 决策项 | 推荐 | 备选 |
|---|---|---|
| 适配器寄宿层 | `metascraper-plugins/` 体系（已有先例） | 独立适配器目录 |
| 浏览器自动化 | 直接复用现有 Playwright 池 | — |
| 中文正文兜底 | 现有 Readability 子进程 | Trafilatura（Python sidecar） |
| Embedding 模型 | OpenAI `text-embedding-3-small` 起步，可切 Ollama `bge-m3` | 阿里 DashScope `text-embedding-v3` |
| 向量存储 | `sqlite-vec` 扩展 | BLOB 自实现余弦；外置 Qdrant（v2） |
| 检索融合 | RRF (Reciprocal Rank Fusion) | 加权和 |
| AI 客户端 | 强制走 `packages/shared/inference.ts` | — |
| 队列 | 复用 `queue-liteque` | — |

> 任何替代选择都需在子文档/PR 中给一段 ADR 级别的理由。

## 4. 工作包与并行依赖

```
                   ┌──────────────────────────┐
                   │  WP-01 适配器框架(基线)  │  ← 必须先完成
                   └────────────┬─────────────┘
                                │
        ┌─────────┬─────────────┼─────────────┬─────────┐
        │         │             │             │         │
   ┌────▼───┐┌───▼────┐  ┌─────▼─────┐  ┌────▼────┐ ┌──▼────────┐
   │WP-02   ││WP-03 X ││  WP-04 抖音│  │WP-05 XHS│ │WP-06 媒体  │
   │微信公众││Twitter ││            │  │ 小红书  │ │管线(可选)  │
   └────────┘└────────┘  └───────────┘  └─────────┘ └────────────┘

   并行无依赖：
   ┌────────────────┐    ┌────────────────────┐
   │WP-07 中文打标  │    │WP-08 语义检索 RAG  │
   └────────────────┘    └────────────────────┘
```

| 工作包 | 文档 | 可并行起步 | 强依赖 |
|---|---|---|---|
| WP-01 适配器框架 | `01-adapter-framework.md` | 立刻 | — |
| WP-02 微信公众号 | `02-adapter-wechat.md` | WP-01 | — |
| WP-03 X (Twitter) | `03-adapter-x.md` | WP-01 | — |
| WP-04 抖音 | `04-adapter-douyin.md` | WP-01 | — |
| WP-05 小红书 | `05-adapter-xiaohongshu.md` | WP-01 | — |
| WP-06 媒体异步管线 | `06-asset-pipeline.md` | WP-01 完成后 | 影响图集多的适配器性能 |
| WP-07 中文 AI 打标 | `07-ai-tagging-zh.md` | 立刻 | — |
| WP-08 语义检索 | `08-semantic-search.md` | 立刻 | 与 WP-07 数据格式松耦合 |

## 5. 共享约束（所有 agent 必读）

- 数据库是 **SQLite + Drizzle**；schema 改动走标准 migration
- 抓取出站请求必须经过 `packages/shared/network.ts` 的 SSRF 校验
- 所有外部 AI 调用必须走 `packages/shared/inference.ts`，不允许直接 `fetch`
- 用户 cookie / API key 加密存储，参考现有 `apiKeys` 表方案
- 日志/错误信息严禁泄露用户凭据
- env 改动同步 `.env.sample` 与 `serverConfig`
- 测试要求：`pnpm test` + `e2e_tests` 全绿；新能力附黄金集/对照集

## 6. 必读代码基线

每个 agent 实施前**至少看过**：

- `apps/workers/workers/crawlerWorker.ts` — 抓取主链路
- `apps/workers/metascraper-plugins/*` — 站点特化插件示范
- `apps/workers/workers/inference/*` + `packages/shared/inference.ts` + `prompts*.ts`
- `packages/db/schema.ts`
- `packages/shared/search.ts` + `packages/plugins/search-meilisearch/`

## 7. 验收总入口

- 4 平台各 5 条真实黄金集，title/cover/正文 100% 非空
- 黄金集抓取 P50 < 3s、P95 < 8s（不含视频下载）
- 中文打标人工抽样准确率 > 80%
- 语义检索 30 条 query-doc 对 top5 召回率 > 70%
- Karakeep 原有入口（扩展、RSS、Webhook、邮箱）回归全绿

## 8. 子文档索引

- [01-adapter-framework.md](./01-adapter-framework.md)
- [02-adapter-wechat.md](./02-adapter-wechat.md)
- [03-adapter-x.md](./03-adapter-x.md)
- [04-adapter-douyin.md](./04-adapter-douyin.md)
- [05-adapter-xiaohongshu.md](./05-adapter-xiaohongshu.md)
- [06-asset-pipeline.md](./06-asset-pipeline.md)
- [07-ai-tagging-zh.md](./07-ai-tagging-zh.md)
- [08-semantic-search.md](./08-semantic-search.md)
