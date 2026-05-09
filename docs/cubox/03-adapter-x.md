# WP-03 X (Twitter) 适配器

> **依赖**：WP-01 适配器框架。
> **难度**：中。

## 范围

URL 模式：`(twitter|x).com/*/status/*`、`(fxtwitter|vxtwitter).com/*/status/*`

抓取目标：
- 推文正文、作者、发布时间
- 图片、视频、外链卡片
- 串推（thread）合并（**可选**，给开关）
- 引用推文（quoted tweet）

## 实现线索

主路径推荐：
- 公开端点 `https://cdn.syndication.twimg.com/tweet-result?id={id}&token={t}` 不需登录返回完整 JSON。token 算法已被多个开源项目实现，自己研究后实现，**不要直接拷贝代码**

兜底：
- 公开服务 `https://api.fxtwitter.com/{user}/status/{id}`
- 最后回退 Playwright（用现有池 + stealth）

参考实现：[FixTweet/FxTwitter](https://github.com/FixTweet/FxTwitter)（仅供研究字段路径与 token 算法）

媒体：图片直引 `pbs.twimg.com`（无需转存）；视频可走 yt-dlp（已有）。

## 验收

- 黄金集 5 条：单图、多图、视频、串推、引用推文
- title/cover/正文/媒体 100% 非空
- P50 < 2s、P95 < 5s

## 风险

- syndication 端点偶发限流 → fxtwitter 兜底
- 部分 NSFW / 受限推文匿名访问失败 → 接受失败并降级至通用链路

## 留给 agent 决定

- token 算法本地实现 vs 调用现成开源端点
- 串推合并触发条件（默认开 / 默认关）
- 受限内容失败时是否上报告警 / 静默降级
