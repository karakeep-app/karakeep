# WP-08 语义检索（RAG 检索）

> **依赖**：无（可立即开始；与抓取/打标松耦合）。
> **难度**：中。
> **范围**：仅做"用自然语言找到相关收藏"，**不做问答 / 摘要 / Agent**。

## 目标

在 Karakeep 现有 Meilisearch 全文检索基础上，新增**向量检索**通道，并以 RRF 融合返回结果。

## 设计要点（推荐方案）

1. **Embedding 调用**：在 `packages/shared/inference.ts` 增加 `.embed()` 接口，遵循已有 provider 切换模型（OpenAI / Ollama / DashScope）
2. **存储**：推荐 **`sqlite-vec` 扩展**（SQLite 原生，零额外组件）；如评估不适用，降级方案为 BLOB + 应用层余弦
3. **Schema**（建议）：
   - `bookmark_chunks(id, bookmarkId, idx, content, tokenCount, createdAt)`
   - `bookmark_embeddings(chunkId, model, dim, embedding, createdAt)`
4. **写入链路**：bookmark 入库后排队进 embedder worker；可与现有 inferenceWorker 合并或独立（agent 自定）
5. **检索链路**：
   - 同模型把 query 向量化
   - 向量 top-K + Meilisearch top-K 各自召回
   - RRF 融合（k=60）
   - 去重到 bookmark 维度，返回 top-N + 命中 chunk
6. **API**：在现有 search tRPC 路由旁加新 procedure，输入输出尽量对齐 BM25 路径
7. **UI**：搜索框旁一个 toggle（全文 / 智能）；命中 chunk 高亮

## 配置（`.env.sample`）

```
EMBEDDING_PROVIDER=openai|ollama|dashscope
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIM=1024
```

## 验收

- 30 条 query-doc 对 top5 召回率 > 70%
- 新增 procedure 性能：单查询 < 500ms（10 万 chunks 量级）
- 不破坏 BM25 路径回归
- 切换 provider 配置后无代码改动

## 留给 agent 决定

- 是否用 `sqlite-vec`（验证装载、备份/恢复影响后决定）
- chunk 切分策略（按段 / 固定 token / 滑窗）
- embedder worker 独立 vs 复用 inferenceWorker
- query 改写（是否做扩展查询、关键词补全）
- 命中 chunk 高亮 UI 形态
- 重新嵌入策略（模型变更后如何回填）
