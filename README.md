# jin10-to-qywx

# Jin10 RSS to QY WeChat / 金十 RSS 推送到企业微信

一个轻量级脚本，通过 RSS 拉取金十快讯/分类数据，并自动推送到企业微信机器人（群聊 Webhook）。内置去重与断点续推，适合用 GitHub Actions 定时运行。

A lightweight script that fetches Jin10 RSS feeds and pushes new items to a WeCom (QY WeChat) group bot webhook. It includes deduplication and resume support, and is designed to run on a schedule via GitHub Actions.

---

## Features / 功能特性

* Multi-feed support: read multiple RSS URLs from one env var. / 支持多 RSS 源（环境变量一行一个 URL）。
* Deduplication across feeds. / 全局去重（跨源防重复）。
* Resume from last sent item per feed. / 每个 RSS 源断点续推。
* Markdown message to WeCom bot. / 以企业微信 Markdown 消息推送。
* Auto-save state to `last.json` and commit it to the runtime branch via GitHub Actions. / 自动写入 `last.json` 并由 Actions 回写到运行态分支。

## Requirements / 运行要求

* **Node.js 18+ (Actions 使用 Node 20)。/ Node.js 18+（Actions 中为 Node 20）。**
* Dependencies: `rss-parser`, `axios`. / 依赖：`rss-parser`、`axios`。

> 本仓库目前未包含 `package.json`，本地运行需先初始化并安装依赖（见下文）。

## Quick Start (Local) / 本地快速开始

1. **安装依赖 / Install deps**

```
npm init -y
npm i rss-parser axios
```

2. **配置环境变量 / Set env vars**

```
export RSS_URL="https://example.com/rss1.xml
https://example.com/rss2.xml"

export QYWX_WEBHOOK="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxx"
```

3. **运行 / Run**

```
node rss_to_qywx.js
```

## Deploy with GitHub Actions / 使用 GitHub Actions 部署

**工作流文件：**`.github/workflows/rss.yml`，默认每 10 分钟执行一次，也支持手动触发。

**Workflow file:** `.github/workflows/rss.yml`. It runs every 10 minutes by default and can be triggered manually.

### Automation State & Branch Model / 自动化状态与分支模型

To ensure reliable deduplication, this project separates runtime state from the stable code branch:

* The bot always runs on and updates the branch `bot/update-last`.
* Runtime state (`last.json`) is continuously committed to this branch by GitHub Actions.
* The `main` branch remains stable and is only updated via an automated Pull Request.
* Automated PRs labeled `automated` are for state sync only and require no manual action.

> Note: The bot does **not** rely on `main` for deduplication during execution.

### 1) Fork 仓库 / Fork this repo

### 2) 设置 Secrets / Set repository secrets

进入 GitHub 仓库 **Settings → Secrets and variables → Actions**，添加：

* `RSS_URL`: 多个 RSS 地址，使用换行分隔。
  Multiple RSS URLs separated by newlines.
* `QYWX_WEBHOOK`: 企业微信机器人 Webhook URL。
  WeCom group bot webhook URL.

### 3) 等待定时触发 / Wait for schedule

Actions 会在运行后自动更新 `last.json`，用于记录已推送的最后一条与全局指纹集合。

Actions will update and commit `last.json` after each run to store the last sent item per feed and a global fingerprint set.

## Configuration Details / 配置说明

### Environment Variables / 环境变量

* `RSS_URL` (required)
  Newline-separated RSS list. The script will iterate in order.
  必填，多个 RSS URL 用换行分隔，脚本按顺序轮询。
* `QYWX_WEBHOOK` (required)
  WeCom webhook to receive markdown messages.
  必填，企业微信机器人 Webhook，用于接收 Markdown 推送。

### State File / 状态文件

* `last.json`
  Stores per-feed last fingerprint and a global `__ALL__` list for dedupe.
  记录每个 RSS 源的最后指纹，以及全局 `__ALL__` 去重集合（最多保留 1000 条）。

## How It Works / 工作原理

* The script reads RSS feeds, reverses items to send old → new.
  拉取 RSS 后反转条目，保证按旧到新发送。
* Each item gets a unique fingerprint: `link` → `guid` → normalized `title + pubDate`.
  唯一指纹优先级**：**`link` → `guid` → 归一化后的 `title + pubDate`。
* Global dedupe: any fingerprint already in `__ALL__` won’t be sent again.
  全局去重：已在 `__ALL__` 中出现的不再重复推送。
* Per-feed resume: if fingerprint equals the stored last one, it is skipped.
  断点续推：与该源上次记录的指纹相同则跳过。
* Messages are sent as WeCom markdown, with category tags derived from RSS URL.
  以企业微信 Markdown 推送，分类标签由 RSS URL 中的 `category/<id>` 映射生成。

## Notes / 注意事项

* Category tagging uses a built-in map; unmatched feeds fall back to `金十`.
  分类标签基于内置映射；无法匹配时默认 `金十`。
* There is a keyword filter only for the `金十·黄金` tag (see code).
  仅对 `金十·黄金` 分类做关键词过滤（见 `rss_to_qywx.js`）。
* WeCom markdown has length limits; very long items may be truncated by WeCom.
  企业微信 Markdown 有长度限制，过长内容可能被截断。
* If your RSS provider rate-limits, increase the cron interval.
  若 RSS 源有频率限制，可适当调大 Actions 的定时周期。

## Troubleshooting / 常见问题

* **Nothing sent / 没有推送**
  Check  `RSS_URL` format (newline-separated) and whether items are filtered or already in `last.json`.
  检查 `RSS_URL` 是否换行分隔、是否被过滤或已记录在 `last.json`。
* **Actions failing on npm ci / Actions 里 npm ci 失败**
  This repo currently has no `package.json`. Either add one or switch the workflow to install deps another way.
  目前仓库未包含 `package.json`，可自行添加或调整工作流安装依赖方式。

## License / 许可

**MIT**
