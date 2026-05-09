# WP-05 小红书适配器

> **依赖**：WP-01 适配器框架。
> **难度**：高。**最早开始，最容易踩坑。**

## 范围

URL 模式：`xhslink.com/*`、`(www|m).xiaohongshu.com/(discovery/item|explore)/*`

抓取目标：
- 笔记标题、正文 desc、作者、发布时间
- 图集（图文笔记） / 视频（视频笔记）
- 封面、话题标签

## 实现线索

主路径推荐：
- 短链 `xhslink.com/xxx` 走 302 跟随展开为完整 URL（可能带 `xsec_token` 查询参数，需要保留）
- 移动端/PC 网页 HTML 中嵌有 `window.__INITIAL_STATE__ = {...}`，包含完整笔记 JSON
- 关键 JSON 路径：`note.noteDetailMap.{noteId}.note`，字段含 `title / desc / imageList[].urlDefault / type / video.media.stream.h264[0].masterUrl / user.nickname`
- **PC API**（`/api/sns/web/v1/feed`）需要 `x-s` / `x-t` 签名 → **不做**（合规与维护成本均不划算）

兜底链：
1. HTTP + 解析 INITIAL_STATE
2. Playwright + stealth + 用户 cookie（用户级 / 全局兜底）
3. 失败降级到通用链路（接受质量损失）

参考实现（仅研究字段路径）：[ReaJason/xhs](https://github.com/ReaJason/xhs)

媒体：图片是 webp，强烈建议转存到 assetdb。

## 用户级 Cookie 配置

- UI 入口在用户设置页（具体位置由 agent 决定）
- 加密存储到 `platform_credentials` 表
- 适配器请求时按 `userId` 注入；未配置时回落到 env `XHS_USER_COOKIE`（可空）

## 验收

- 黄金集 5 条：图文笔记、视频笔记、长 desc、含话题、收藏可见但非登录态
- title/cover/正文/图集 100% 非空（带 cookie 时）
- 不带 cookie 时覆盖率 ≥ 70%
- P50 < 3s、P95 < 8s

## 风险（高）

- HTML 结构 / 字段名升级 → 解析层做防御性处理；保留 raw JSON 便于重抽；**单测黄金集进 CI 每日跑**
- 反爬升级（IP 风控、验证码） → 多重回退；可选代理池；告警

## 留给 agent 决定

- 短链展开实现（HTTP HEAD vs GET 跟随）
- INITIAL_STATE 解析方式（正则 / vm 沙箱 / json5）
- 视频笔记是否自动 yt-dlp（建议默认仅元数据 + 封面）
- 失败时的告警阈值与渠道
