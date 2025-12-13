# jin10-to-qywx

# Jin10 RSS to QY WeChat / 金十 RSS 推送到企业微信

A lightweight script that fetches Jin10 RSS feeds and pushes new items to a WeCom (QY WeChat) group bot webhook. It includes MD5-based deduplication, empty message filtering, and auto-cleanup. Designed to run on a schedule via GitHub Actions.

一个轻量级脚本，通过 RSS 拉取金十快讯/分类数据，并自动推送到企业微信机器人（群聊 Webhook）。内置 MD5 哈希去重、空消息过滤和自动清理机制，适合用 GitHub Actions 定时运行。

---

## Features / 功能特性

* **Multi-feed support**: Read multiple RSS URLs from one env var. / **多源支持**：环境变量一行一个 URL。
* **MD5 hash deduplication**: Composite hash based on ID + title + content + time. / **MD5 哈希去重**：基于 ID + 标题 + 内容 + 时间的综合哈希。
* **Empty message filtering**: Dual-layer filter to block blank cards. / **空消息过滤**：双重过滤拦截空白卡片。
* **Privacy protection**: RSS URLs are stored as MD5 hashes, not plaintext. / **隐私保护**：RSS 链接以 MD5 哈希存储，不暴露原始地址。
* **Auto-cleanup**: 40,000 record limit with automatic cleanup notification. / **自动清理**：40,000 条记录上限，超限自动清理并通知。
* **Resume support**: Per-feed last item tracking. / **断点续推**：每个 RSS 源独立记录最后推送位置。
* **Markdown messages**: Push to WeCom bot with category tags. / **Markdown 消息**：推送到企业微信，带分类标签。

## Requirements / 运行要求

* **Node.js 18+** (Actions uses Node 20). / **Node.js 18+**（Actions 中为 Node 20）。
* Dependencies / 依赖：`rss-parser`, `axios`

## Quick Start (Local) / 本地快速开始

1. **Install dependencies / 安装依赖**

```bash
npm install
```

2. **Set environment variables / 配置环境变量**

```bash
export RSS_URL="YOUR_KEY"

export QYWX_WEBHOOK="YOUR_KEY"
```

3. **Run / 运行**

```bash
node rss_to_qywx.js
```

## Deploy with GitHub Actions / 使用 GitHub Actions 部署

### Workflow Files / 工作流文件

| File / 文件                          | Schedule / 频率           | Purpose / 用途                                                                                                  |
| ------------------------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/rss.yml`          | Every 10 min / 每 10 分钟 | Fetch RSS, push messages, update `last.json` on bot branch. / 抓取 RSS、推送消息、更新 bot 分支的 `last.json`。 |
| `.github/workflows/sync-to-main.yml` | Daily / 每天一次          | Create PR to sync `last.json` to main branch. / 创建 PR 将 `last.json` 同步到 main 分支。                       |

### Branch Model / 分支模型

This project uses a two-branch model to separate runtime state from stable code:

本项目采用双分支模型，将运行时状态与稳定代码分离：

| Branch / 分支     | Purpose / 用途                                                                    | Updated By / 更新者           |
| ----------------- | --------------------------------------------------------------------------------- | ----------------------------- |
| `main`            | Stable code, periodic state sync. / 稳定代码，定期状态同步。                      | Manual PR merge / 手动合并 PR |
| `bot/update-last` | Runtime state (`last.json`), updated every 10 min. / 运行时状态，每 10 分钟更新。 | GitHub Actions Bot            |

**Workflow:**
1. `rss.yml` runs on `bot/update-last` branch, pulls latest code from `main`, keeps `last.json`.
2. After running, commits updated `last.json` to `bot/update-last`.
3. `sync-to-main.yml` runs daily, creates PR to merge `last.json` to `main`.

**工作流程：**
1. `rss.yml` 在 `bot/update-last` 分支运行，从 `main` 拉取最新代码，保留 `last.json`。
2. 运行后将更新的 `last.json` 提交到 `bot/update-last`。
3. `sync-to-main.yml` 每天运行，创建 PR 将 `last.json` 合并到 `main`。

### Setup Steps / 设置步骤

#### 1) Fork or clone this repo / Fork 或克隆本仓库

#### 2) Set repository secrets / 设置仓库密钥

Go to **Settings → Secrets and variables → Actions**, add:

进入 **Settings → Secrets and variables → Actions**，添加：

* `RSS_URL`: Multiple RSS URLs separated by newlines. / 多个 RSS 地址，换行分隔。
* `QYWX_WEBHOOK`: WeCom group bot webhook URL. / 企业微信机器人 Webhook URL。

#### 3) Push changes / 推送更改

**For collaborators / 协作者推送方式：**

```bash
# Push code changes to main branch only
# 只推送代码更改到 main 分支
git push origin main

# The bot branch will be auto-created by Actions
# bot 分支会由 Actions 自动创建
```

> **Note**: Only push **code changes** to `main`. Never manually push `last.json` to `main`. The bot branch is managed automatically by GitHub Actions.

> **注意**：只推送**代码更改**到 `main`。不要手动推送 `last.json` 到 `main`。bot 分支由 GitHub Actions 自动管理。

#### 4) Wait for schedule / 等待定时触发

Actions will auto-run and manage both branches.

Actions 会自动运行并管理两个分支。

## Configuration Details / 配置说明

### Environment Variables / 环境变量

| Variable / 变量 | Required / 必填 | Description / 描述                                      |
| --------------- | --------------- | ------------------------------------------------------- |
| `RSS_URL`       | Yes / 是        | Newline-separated RSS URLs. / 换行分隔的 RSS 地址列表。 |
| `QYWX_WEBHOOK`  | Yes / 是        | WeCom webhook URL. / 企业微信机器人 Webhook。           |

### State File / 状态文件

`last.json` uses version 2 format:

`last.json` 使用 v2 格式：

```json
{
  "version": 2,
  "feeds": {
    "<md5(rss_url)>": "<md5(last_item_id)>"
  },
  "hashes": ["<composite_hash>", ...],
  "count": 1000,
  "updatedAt": "2025-12-13T03:00:00Z"
}
```

* `feeds`: Per-feed last item hash (RSS URL as MD5 key). / 每个源的最后条目哈希（RSS URL 用 MD5 作为键）。
* `hashes`: Global deduplication hashes (max 40,000). / 全局去重哈希（最多 40,000 条）。
* `count`: Current hash count. / 当前哈希数量。
* `updatedAt`: Last update timestamp. / 最后更新时间戳。

## How It Works / 工作原理

1. **Fetch RSS**: Read feeds, reverse items to send old → new. / **获取 RSS**：拉取后反转条目，按旧到新发送。
2. **Generate fingerprint**: Priority: `link` → `guid` → normalized `title + pubDate`. / **生成指纹**：优先级：`link` → `guid` → 归一化 `title + pubDate`。
3. **Composite hash**: Create MD5 from `id|title|content|time`. / **综合哈希**：用 `id|title|content|time` 生成 MD5。
4. **Deduplication**: Skip if composite hash already exists. / **去重**：若综合哈希已存在则跳过。
5. **Empty filter**: Block messages with empty title AND content. / **空消息过滤**：拦截标题和内容都为空的消息。
6. **Keyword filter**: Must hit whitelist, must not hit blacklist. / **关键词过滤**：必须命中白名单，不能命中黑名单。
7. **Push**: Send as WeCom markdown with category tag. / **推送**：以企业微信 Markdown 发送，带分类标签。
8. **Auto-cleanup**: When reaching 40,000 records, remove oldest 20,000 and notify. / **自动清理**：达到 40,000 条时，清除最旧的 20,000 条并通知。

## Notes / 注意事项

* Category tagging uses a built-in map; unmatched feeds fall back to `金十`. / 分类标签基于内置映射；无法匹配时默认 `金十`。
* Whitelist/blacklist keywords are defined in the script. / 白名单/黑名单关键词定义在脚本中。
* WeCom markdown has length limits; very long items may be truncated. / 企业微信 Markdown 有长度限制，过长内容可能被截断。
* If your RSS provider rate-limits, increase the cron interval. / 若 RSS 源有频率限制，可适当调大定时周期。

## Troubleshooting / 常见问题

| Issue / 问题                  | Solution / 解决方案                                                                                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Nothing sent / 没有推送       | Check `RSS_URL` format (newline-separated), keyword filters, or if already in history. / 检查 `RSS_URL` 格式、关键词过滤、或已在历史记录中。 |
| Empty messages / 空消息       | Script has dual-layer filters; if still occurs, report an issue. / 脚本有双重过滤；如仍出现请提交 issue。                                    |
| Duplicate messages / 重复消息 | Ensure `last.json` is being committed properly. / 确保 `last.json` 正确提交。                                                                |

## License / 许可

**MIT**
