# WP-06 媒体异步管线（可选优化）

> **依赖**：WP-01；建议在 ≥ 2 个适配器完成后再做，避免过早抽象。
> **难度**：中。

## 目标

让多图笔记（小红书 / 抖音图集 / 微信公众号长文）的抓取主链路保持快速：**先入卡片，图片后台异步落地**。

## 现状

`crawlerWorker.ts` 已经能 `downloadAndStoreImage`，但当前是同步的；图集多时主链路被拖慢。

## 设计要点

1. 适配器返回 `imageList` URL 数组与「占位 asset id」
2. 主链路立即把卡片 / 元数据写库 + 触发后续 worker（打标、embedding）
3. 新增（或扩展现有）asset worker 后台批量下载并替换 placeholder
4. 资产下载失败有重试上限，不要无限重试
5. 阅读视图能识别"图片正在下载"占位状态

## 现有可复用

- `assetPreprocessingWorker.ts` 范式
- `assetdb` `saveAsset` / `silentDeleteAsset`

## 验收

- 抓取 30 张图的笔记主链路返回 < 3s
- 图片在 60s 内全部落地
- 失败图片不阻塞卡片可见
- 阅读视图正确显示加载/失败状态

## 留给 agent 决定

- 是否新建 worker，还是扩展 `assetPreprocessingWorker`
- 占位 asset 的存储形态（行内空 row / 单独表）
- 是否做并发去重（同 URL 多次入队合并）
