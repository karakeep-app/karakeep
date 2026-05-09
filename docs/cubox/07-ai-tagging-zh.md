# WP-07 中文 AI 打标增强

> **依赖**：无（可立即开始）。
> **难度**：低-中。
> **协同**：与适配器层松耦合，适配器写入的 `platform / author / rawExtraction` 会被本工作包消费。

## 现状

- `apps/workers/workers/inference/tagging.ts` 走通用 prompt，偏英文
- 用户设置已有 `inferredTagLang`、`tagStyle`、`curatedTagIds`

## 目标

1. 中文 prompt 模板（按用户语言/平台触发）
2. 把平台元数据（platform、author、imageOcrText）注入 prompt
3. Tag 同义词归一化（**优先复用规则引擎 `ruleEngineWorker`**）

## 设计要点

- Prompt 模板放在 `prompts.ts` / `prompts.server.ts`，作为新增可选模板，不破坏现有英文路径
- 触发条件：`inferredTagLang === 'zh'` 或平台 ∈ {wechat, xhs, douyin}
- 标签风格继续沿用用户 `tagStyle` 设置
- 归一化通过预置一套**默认规则集**（可选启用），用户可改

## 验收

- 中文文章 50 条人工抽样准确率 > 80%
- 不破坏现有英文链路（回归测试）
- 同义词归一化默认规则覆盖 ≥ 30 组高频别名（如 AI/人工智能/机器学习）

## 留给 agent 决定

- 中文 prompt 触发优先级与判定
- 平台元数据进 prompt 的具体格式
- 是否提供"中文标签库"作为引导（建议提供基础集合）
