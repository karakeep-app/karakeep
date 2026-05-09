# WP-01 适配器框架（基线）

> **角色**：所有平台适配器的公共底座。
> **依赖**：无。
> **下游**：WP-02 ~ WP-05 都依赖本工作包提供的接口与路由。

## 目标

在 Karakeep 的抓取链路中插入一个**轻量路由层**，按 URL 把请求分派给对应平台的专用提取器；未命中则走原有通用链路（Readability + Playwright）。

## 设计要点

1. 决定**寄宿位置**：优先评估能否扩展 `apps/workers/metascraper-plugins/` 模式（已有 amazon、reddit 先例）；如果发现 metascraper 模型不适配（譬如需要短链展开 + 内嵌 JSON 解析），再考虑独立的适配器目录。**写一段决定理由放在 PR 描述。**
2. 定义最小适配器契约：
   - URL 匹配
   - 优先级（处理多重命中）
   - 抽取出统一的 `ExtractedContent`（标题、正文、封面、图集、视频列表、作者、平台、原始 JSON）
3. 在 `crawlAndParseUrl` 入口处加路由分派；未命中走原链路（**只插桩一处**）
4. 定义浏览器借用约定：复用现有 Playwright 池，不新建第二套
5. 定义平台 cookie 注入约定：从一个统一处读取（用户级 / 全局兜底两层）
6. 定义指标埋点：每个适配器命中、耗时、失败原因走现有 metrics
7. 定义黄金集测试约定：每个适配器在 `__tests__` 下放黄金集 fixture，CI 可跑

## 数据模型建议

`bookmarkLinks` 增字段（具体名字随意）：
- `platform`：平台标识
- `rawExtraction`：JSON，存适配器原始数据，便于日后重抽
- `adapterVersion`：用于平台变更后回填判定

新增表：
- `platform_credentials(userId, platform, encryptedCookie, updatedAt)`
- `adapter_extraction_log(bookmarkId, adapter, version, latencyMs, ok, error, createdAt)`

## 配置（`.env.sample`）

```
ADAPTER_TIMEOUT_MS=8000
ADAPTER_DEFAULT_RATE_LIMIT=5     # req/s/domain
PROXY_LIST=                      # 可选
```

## 验收

- [ ] 框架与一个**最简示例适配器**（建议直接和 WP-02 微信公众号合并交付）一起合主干
- [ ] 路由命中/未命中均通过 e2e
- [ ] schema migration 通过且向后兼容
- [ ] 新增 metrics 在 dev 环境可观测

## 留给 agent 决定

- 适配器接口具体形态、命名、目录路径
- 是否复用 metascraper 体系
- 路由表实现：URL 模式数组 / 域名 map / hostname trie
- 失败降级策略（自动回退到通用链路？阈值？）
