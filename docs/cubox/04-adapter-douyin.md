# WP-04 抖音适配器

> **依赖**：WP-01 适配器框架。
> **难度**：中。

## 范围

URL 模式：`v.douyin.com/*`、`(www.)?iesdouyin.com/share/(video|note|slides)/*`、`www.douyin.com/(video|note)/*`

抓取目标：
- 文案、作者、发布时间
- 视频（无水印 URL）、BGM 元数据
- 图集（图文笔记 / slides）、封面

## 实现线索

主路径推荐：
- 短链 `v.douyin.com/xxx` 走 302 跟随得到 `iesdouyin.com/share/...`
- 分享页 HTML 内 `<script id="RENDER_DATA">` 是 URL 编码的完整 JSON，`decodeURIComponent` 即可解析
- 桌面端 `www.douyin.com` 有签名校验，**不要走桌面端**
- 视频走 yt-dlp（已支持 douyin）

参考实现（仅研究字段路径）：
- [Johnserf-Seed/f2](https://github.com/Johnserf-Seed/f2)
- [JoeanAmier/TikTokDownloader](https://github.com/JoeanAmier/TikTokDownloader)

兜底：Playwright。

## 验收

- 黄金集 5 条：视频笔记、图文笔记、slides、长文案、含话题标签
- title/cover/desc/媒体 100% 非空
- P50 < 2s、P95 < 5s（图片下载除外）

## 风险

- RENDER_DATA 字段命名偶发调整 → 解析层做容错；保留 raw JSON
- 部分作者隐私设置导致字段缺失 → 接受降级

## 留给 agent 决定

- 视频是否默认下载（建议默认仅元数据 + 封面）
- 图集是否拼接到正文 Markdown，还是仅作为图片 asset 关联
