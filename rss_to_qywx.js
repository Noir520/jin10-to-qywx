/**
 * Jin10 RSS to QY WeChat
 * 金十 RSS 推送到企业微信
 * 
 * A script that fetches Jin10 RSS feeds and pushes new items to WeCom webhook.
 * 通过 RSS 拉取金十快讯并推送到企业微信机器人。
 */

const Parser = require('rss-parser');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto');

/* ========== 配置 / Configuration ========== */

const RSS_ENV = process.env.RSS_URL;
const WEBHOOK = process.env.QYWX_WEBHOOK;
const STORE = 'last.json';

// 历史记录上限 / History limit settings
const MAX_HISTORY = 40000;
const CLEANUP_SIZE = 20000;

const RSS_LIST = RSS_ENV.split('\n').map(i => i.trim()).filter(Boolean);
const parser = new Parser({ timeout: 15000 });

/* ========== 工具函数 / Utility Functions ========== */

/**
 * 生成 MD5 哈希 / Generate MD5 hash
 */
function md5(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

/**
 * 文本归一化（去除标点符号，转小写）
 * Normalize text (remove punctuation, lowercase)
 */
function normalize(t = '') {
  return t.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
}

/**
 * 获取消息唯一标识 / Get unique item fingerprint
 * 优先级 / Priority: link → guid → normalized(title + pubDate)
 */
function idFingerprint(it) {
  return it.link || it.guid || normalize((it.title || '') + (it.pubDate || ''));
}

/**
 * 生成综合哈希（ID + 标题 + 内容 + 时间）
 * Create composite hash (ID + title + content + time)
 */
function createCompositeHash(id, title, content, time) {
  const raw = `${id}|${normalize(title)}|${normalize(content)}|${time}`;
  return md5(raw);
}

/* ========== 读取历史记录 / Load History ========== */

let history = { version: 2, feeds: {}, hashes: [], count: 0, updatedAt: '' };

if (fs.existsSync(STORE)) {
  const raw = JSON.parse(fs.readFileSync(STORE, 'utf8'));

  if (raw.version === 2) {
    history = raw;
  } else {
    // 旧格式迁移 / Migrate from old format
    console.log('📦 检测到旧版本 last.json，正在迁移... / Migrating old last.json...');
    const oldAll = raw.__IDS__ || raw.__ALL__ || [];
    const oldTriples = raw.__TRIPLES__ || [];

    for (const key of Object.keys(raw)) {
      if (!key.startsWith('__') && typeof raw[key] === 'string') {
        history.feeds[md5(key)] = md5(raw[key]);
      }
    }

    const combinedSet = new Set();
    oldAll.forEach(id => combinedSet.add(md5(id)));
    oldTriples.forEach(t => combinedSet.add(md5(t)));
    history.hashes = Array.from(combinedSet);
    history.count = history.hashes.length;

    console.log(`✅ 迁移完成，共 ${history.count} 条 / Migration done, ${history.count} records`);
  }
}

const sentHashSet = new Set(history.hashes || []);

/* ========== 分类标签映射 / Category Tag Mapping ========== */

function tagOf(url) {
  if (url.includes('/important')) return '金十·重要快讯';
  const map = {
    '1': '贵金属', '2': '黄金', '3': '白银',
    '12': '外汇', '13': '欧元', '14': '英镑', '15': '日元', '16': '美元', '17': '瑞郎', '18': '人民币',
    '24': '地缘', '44': '缅甸', '45': '印巴', '46': '中东', '155': '阿富汗', '167': '俄乌',
    '25': '人物', '47': '鲍威尔', '49': '拉加德', '50': '特朗普', '51': '拜登', '157': '巴菲特',
    '26': '央行', '53': '美联储', '54': '中行', '55': '欧央行', '56': '日央行', '137': '货币政策',
    '141': '英央', '159': '澳联', '160': '新西兰', '161': '加央', '112': '高盛', '72': '美银', '71': '三大评级',
    '34': '政策', '33': '债券', '75': '中国', '76': '美国', '77': '欧盟', '78': '日本', '79': '关税',
    '81': '香港', '120': '英国', '35': '经济数据',
    '38': '灾害', '96': '地震', '97': '爆炸', '98': '海啸', '99': '寒潮', '100': '洪涝', '101': '火灾', '102': '矿难', '103': '枪击'
  };
  const m = url.match(/category\/(\d+)/);
  return m && map[m[1]] ? `金十·${map[m[1]]}` : '金十';
}

/* ========== 消息过滤 / Message Filtering ========== */

/**
 * 检查 Markdown 是否有实际内容
 * Check if markdown has meaningful content
 */
function isMeaningfulMarkdown(md = '') {
  if (!md) return false;

  const stripped = md
    .replace(/[#>*_\-\n\r]/g, '')
    .replace(/\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/🕒/g, '')
    .replace(/\s+/g, '');

  if (stripped.length < 6) return false;
  if (/^[0-9:.\-]+$/.test(stripped)) return false;

  return true;
}

/**
 * 检查是否为空消息（标题和内容都为空或极少字符）
 * Check if message is empty (title and content both empty or too short)
 */
function isEmptyMessage(title, text) {
  const cleanTitle = normalize(title);
  const cleanText = normalize(text);
  return cleanTitle.length < 2 && cleanText.length < 2;
}

// 白名单关键词 / Whitelist keywords
const WHITE_KEYS = [
  '美联储', '加息', 'CPI', '非农', '通胀', '利率', '美元', '日元',
  '黄金', '原油', '油价', '制裁', '停火', '战争', '特朗普', '鲍威尔', '今日重点'
];

// 黑名单关键词 / Blacklist keywords
const BLACK_KEYS = [
  '广告', '推广', '赞助', '抽奖', '福利', '期货盯盘神器专属文章', '沪金主力合约', 'VIP·85折',
  '沪银主力合约', '金十研究员', '直播', '上海黄金交易所黄金T+D', '上海黄金交易所白银T+D',
  '现货黄金', '纽约期金日内', '股价', '开盘', '日内涨', '日内跌', '期货盯盘神器'
];

/* ========== 通知函数 / Notification Functions ========== */

/**
 * 发送历史记录清理通知
 * Send history cleanup notification
 */
async function sendCleanupNotification(cleanedCount, remainingCount) {
  try {
    await axios.post(WEBHOOK, {
      msgtype: 'markdown',
      markdown: {
        content: `### ⚠️ 历史记录清理通知 / History Cleanup Notice
【系统消息 / System Message】
历史记录已达到 **${MAX_HISTORY}** 条上限，已自动清除时间最久的 **${cleanedCount}** 条记录。
History reached **${MAX_HISTORY}** limit, auto-cleaned **${cleanedCount}** oldest records.
当前剩余 / Remaining: **${remainingCount}** 条`
      }
    });
    console.log('📢 已发送历史记录清理通知 / Cleanup notification sent');
  } catch (e) {
    console.error('❌ 发送清理通知失败 / Failed to send cleanup notification:', e.message);
  }
}

/* ========== 主程序 / Main Program ========== */

(async () => {
  let total = 0;
  let needsCleanupNotification = false;
  let cleanedCount = 0;

  for (const rss of RSS_LIST) {
    let feed;
    try {
      console.log('Fetching:', rss);
      feed = await parser.parseURL(rss);
    } catch (e) {
      console.error('❌ RSS 获取失败 / RSS fetch failed:', rss, e.message);
      continue;
    }

    const rssHash = md5(rss);
    const items = (feed.items || []).reverse();
    const lastIdHash = history.feeds[rssHash] || null;
    let newestIdHash = lastIdHash;

    for (const it of items) {
      const id = idFingerprint(it);
      if (!id) continue;

      const idHash = md5(id);

      // 跳过已处理的最后一条 / Skip last processed item
      if (idHash === lastIdHash) continue;

      let title = (it.title || '').trim();
      let text = (it.contentSnippet || '').trim();
      const time = it.pubDate || '';

      // 第一道防线：严格空消息拦截 / First filter: strict empty message check
      if (isEmptyMessage(title, text)) {
        console.log('⛔ 拦截空消息 / Blocked empty message:', title || '[no-title]');
        continue;
      }

      // 清理伪正文 / Clean pseudo-content
      if (text && normalize(text).length < 4) {
        text = '';
      }

      // 标题与正文重复时清除正文 / Remove content if duplicates title
      if (text && normalize(text).startsWith(normalize(title))) {
        text = '';
      }

      // 综合哈希去重 / Composite hash deduplication
      const compositeHash = createCompositeHash(id, title, text, time);
      if (sentHashSet.has(compositeHash)) {
        console.log('🔄 跳过重复消息 / Skip duplicate:', title ? title.slice(0, 30) : '[no-title]');
        continue;
      }

      const textAll = `${title} ${text}`;
      const hitWhite = WHITE_KEYS.some(k => textAll.includes(k));
      const hitBlack = BLACK_KEYS.some(k => textAll.includes(k));

      // 黑名单优先 / Blacklist has priority
      if (hitBlack) continue;
      // 必须命中白名单 / Must hit whitelist
      if (!hitWhite) continue;

      const tag = tagOf(rss);
      const linkPart = it.link ? `\n[查看原文](${it.link})` : '';
      const msg = `### ${title}\n【${tag}】\n${text ? text + '\n' : ''}${linkPart}${time ? `\n🕒 ${time}` : ''}`;

      // 第二道防线：Markdown 内容检查 / Second filter: meaningful content check
      if (!isMeaningfulMarkdown(msg)) {
        console.log('⛔ 跳过空白消息 / Skip blank message:', title || '[no-title]');
        continue;
      }

      try {
        await axios.post(WEBHOOK, {
          msgtype: 'markdown',
          markdown: { content: msg }
        });
        sentHashSet.add(compositeHash);
        newestIdHash = idHash;
        total++;
      } catch (e) {
        console.error('❌ 推送失败 / Push failed:', e.message);
      }

      await new Promise(r => setTimeout(r, 1000));
    }

    if (newestIdHash) history.feeds[rssHash] = newestIdHash;
  }

  /* ========== 历史记录清理 / History Cleanup ========== */

  let hashesArray = Array.from(sentHashSet);

  if (hashesArray.length >= MAX_HISTORY) {
    console.log(`⚠️ 历史记录已达 ${hashesArray.length} 条，执行清理... / Cleaning up...`);
    cleanedCount = hashesArray.length - CLEANUP_SIZE;
    hashesArray = hashesArray.slice(-CLEANUP_SIZE);
    needsCleanupNotification = true;
    console.log(`✅ 已清理 ${cleanedCount} 条 / Cleaned ${cleanedCount} records`);
  }

  /* ========== 保存状态 / Save State ========== */

  history.hashes = hashesArray;
  history.count = hashesArray.length;
  history.updatedAt = new Date().toISOString();
  history.version = 2;

  fs.writeFileSync(STORE, JSON.stringify(history, null, 2));
  console.log(`✅ 完成，发送 ${total} 条，历史 ${history.count} 条 / Done, sent ${total}, history ${history.count}`);

  if (needsCleanupNotification) {
    await sendCleanupNotification(cleanedCount, hashesArray.length);
  }
})();
