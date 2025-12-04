const Parser = require('rss-parser');
const axios = require('axios');
const fs = require('fs');

const RSS_ENV = process.env.RSS_URL;     // 多行RSS
const WEBHOOK = process.env.QYWX_WEBHOOK;
const STORE = 'last.json';

if (!RSS_ENV || !WEBHOOK) {
  console.error('Missing RSS_URL or QYWX_WEBHOOK');
  process.exit(1);
}

const RSS_LIST = RSS_ENV.split('\n').map(i => i.trim()).filter(Boolean);
const parser = new Parser();

let history = {};
if (fs.existsSync(STORE)) history = JSON.parse(fs.readFileSync(STORE, 'utf8'));

function tagOf(url){
  if (url.includes('/important')) return '金十·重要快讯';
  const map = { '1':'贵金属','2':'黄金','3':'白银','12':'外汇','13':'欧元','14':'英镑','15':'日元','16':'美元','17':'瑞郎','18':'人民币',
                '24':'地缘','44':'缅甸','45':'印巴','46':'中东','155':'阿富汗','167':'俄乌',
                '25':'人物','47':'鲍威尔','49':'拉加德','50':'特朗普','51':'拜登','157':'巴菲特',
                '26':'央行','53':'美联储','54':'中行','55':'欧央行','56':'日央行','137':'货币政策',
                '141':'英央','159':'澳联','160':'新西兰','161':'加央','112':'高盛','72':'美银','71':'三大评级',
                '34':'政策','33':'债券','75':'中国','76':'美国','77':'欧盟','78':'日本','79':'关税','81':'香港','120':'英国',
                '35':'经济数据','38':'灾害','96':'地震','97':'爆炸','98':'海啸','99':'寒潮','100':'洪涝','101':'火灾','102':'矿难','103':'枪击'
              };
  const m = url.match(/category\/(\d+)/);
  return m && map[m[1]] ? `金十·${map[m[1]]}` : '金十';
}

// 净化文本（去空格、去标点，用于比较）
function normalize(s = '') {
  return s.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').toLowerCase();
}

(async () => {
  let total = 0;

  for (const rss of RSS_LIST) {
    const feed = await parser.parseURL(rss);
    const items = (feed.items || []).reverse();
    const last = history[rss] || '';
    let newest = last;

    for (const it of items) {
      if (!it.link || it.link === last) continue;

      const title = (it.title || '').trim();
      let text = (it.contentSnippet || '').trim();
      const time = it.pubDate || '';
      const tag = tagOf(rss);

      // ✅ 强力去重：标题和正文重复就清空正文
      if (normalize(text).startsWith(normalize(title))) {
        text = '';
      }

      // ✅ 关键词过滤
      const KEYS = ['美联储','加息','CPI','非农','通胀','利率','美元','日元','黄金','油','制裁','停火','战争','特朗普','鲍威尔'];
      const textAll = `${title} ${text}`;
      if (!KEYS.some(k => textAll.includes(k))) continue;

      // 构造消息体
      const msg = `### ${title}
【${tag}】
${text ? text + '\n' : ''}
[查看原文](${it.link})${time ? `\n🕒 ${time}` : ''}`;

      await axios.post(WEBHOOK, { msgtype:'markdown', markdown:{ content: msg } });

      newest = it.link;
      total++;

      await new Promise(r => setTimeout(r, 900));
    }

    if (newest) history[rss] = newest;
  }

  fs.writeFileSync(STORE, JSON.stringify(history, null, 2));
  console.log(`完成，发送 ${total} 条`);
})();
