#!/usr/bin/env node

/**
 * 微信公众号文章搜索 + 全文提取工具
 * 功能：搜索文章 → 解析真实链接 → 提取全文内容
 * 用法：
 *   node search_and_fetch.js "关键词"              # 搜索并返回摘要
 *   node search_and_fetch.js "关键词" -n 5 -f      # 搜索并提取全文
 *   node search_and_fetch.js "关键词" -n 3 -f -o result.json
 */

const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const zlib = require('zlib');

// ==================== 工具函数（从 search_wechat.js 移植） ====================

const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:123.0) Gecko/20100101 Firefox/123.0',
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function decompressBody(buffer, contentEncoding) {
  if (!contentEncoding) return buffer;
  const encoding = String(contentEncoding).toLowerCase();
  try {
    if (encoding.includes('gzip')) return zlib.gunzipSync(buffer);
    if (encoding.includes('deflate')) return zlib.inflateSync(buffer);
    if (encoding.includes('br')) return zlib.brotliDecompressSync(buffer);
  } catch {}
  return buffer;
}

async function request(options) {
  const { url, method = 'GET', headers = {}, timeoutMs = 15000, retries = 0 } = options;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const isHttps = urlObj.protocol === 'https:';
        const lib = isHttps ? https : http;
        const reqOptions = {
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method,
          headers,
        };
        const req = lib.request(reqOptions, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks);
            const body = decompressBody(raw, res.headers['content-encoding']);
            resolve({ statusCode: res.statusCode || 0, headers: res.headers, body });
          });
        });
        req.on('error', reject);
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('Request timeout')); });
        req.end();
      });
      return result;
    } catch (e) {
      if (attempt >= retries) throw new Error(`Request failed: ${method} ${url}: ${e.message}`);
      await sleep(300 + attempt * 300);
    }
  }
  throw new Error('Unexpected');
}

async function requestText(options) {
  const resp = await request(options);
  return { ...resp, text: resp.body.toString('utf-8') };
}

function extractCookies(headers) {
  const cookies = [];
  const setCookieHeader = headers['set-cookie'];
  if (setCookieHeader) {
    setCookieHeader.forEach(c => {
      const v = c.split(';')[0];
      if (v) cookies.push(v);
    });
  }
  return cookies.join('; ');
}

async function getSogouCookie() {
  try {
    const resp = await request({
      url: 'https://v.sogou.com/v?ie=utf8&query=&p=40030600',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'identity',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'User-Agent': getRandomUserAgent(),
      },
      timeoutMs: 10000,
      retries: 1,
    });
    const cookies = extractCookies(resp.headers);
    const cookieObj = {};
    if (cookies) {
      cookies.split('; ').forEach(c => {
        const [k, v] = c.split('=');
        if (k && v) cookieObj[k.trim()] = v.trim();
      });
    }
    return { cookieStr: cookies || '', cookieObj };
  } catch {
    return { cookieStr: '', cookieObj: {} };
  }
}

async function httpGet(url, cookieStr = '') {
  const headers = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'identity',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    'User-Agent': getRandomUserAgent(),
  };
  if (cookieStr) headers['Cookie'] = cookieStr;
  const resp = await requestText({ url, headers, timeoutMs: 30000, retries: 1 });
  return resp.text;
}

// ==================== URL 解析 ====================

function extractRedirectUrlFromHtml(html) {
  const metaMatch = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>]+)/i);
  if (metaMatch) return metaMatch[1];

  const jsMatches = [
    /location\.href\s*=\s*["']([^"']+)["']/i,
    /location\s*=\s*["']([^"']+)["']/i,
    /window\.location\s*=\s*["']([^"']+)["']/i,
  ];
  for (const re of jsMatches) {
    const m = html.match(re);
    if (m) return m[1];
  }

  const urlParts = [];
  for (const m of html.matchAll(/url\s*\+=\s*'([^']*)'/g)) urlParts.push(m[1]);
  for (const m of html.matchAll(/url\s*\+=\s*"([^"]*)"/g)) urlParts.push(m[1]);
  if (urlParts.length > 0) {
    const joined = urlParts.join('');
    if (joined.includes('mp.weixin.qq.com')) return joined;
  }
  return null;
}

async function getRealUrl(url, cookieObj = {}) {
  return new Promise((resolve) => {
    if (!url.includes('weixin.sogou.com')) { resolve(url); return; }

    (async () => {
      const baseCookies = 'ABTEST=7|1716888919|v1; IPLOC=CN5101';
      const snuid = cookieObj['SNUID'] || '';
      const cookieStr = snuid ? `${baseCookies}; SNUID=${snuid}` : baseCookies;
      const headers = {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Encoding': 'identity',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        'Cookie': cookieStr,
        'User-Agent': getRandomUserAgent(),
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const resp = await request({ url, headers, timeoutMs: 5000, retries: 0 });
          if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
            if (resp.headers.location.includes('mp.weixin.qq.com')) {
              resolve(resp.headers.location); return;
            }
          }
          if (resp.statusCode === 200) {
            const html = resp.body.toString('utf-8');
            const redirect = extractRedirectUrlFromHtml(html);
            if (redirect && redirect.includes('mp.weixin.qq.com')) {
              resolve(redirect); return;
            }
          }
        } catch {}
        if (attempt < 2) await sleep(1000);
      }
      resolve(url);
    })();
  });
}

// ==================== 文章搜索解析 ====================

function parseRelativeTime(timeText) {
  if (!timeText) return { datetime: '', dateText: '' };
  const now = new Date();
  let target = new Date(now);
  const dayMatch = timeText.match(/(\d+)天前/);
  const hourMatch = timeText.match(/(\d+)小时前/);
  const minuteMatch = timeText.match(/(\d+)分钟前/);
  if (dayMatch) target.setDate(now.getDate() - parseInt(dayMatch[1]));
  else if (hourMatch) target.setHours(now.getHours() - parseInt(hourMatch[1]));
  else if (minuteMatch) target.setMinutes(now.getMinutes() - parseInt(minuteMatch[1]));
  else {
    const d = timeText.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (d) target = new Date(parseInt(d[1]), parseInt(d[2]) - 1, parseInt(d[3]));
    else return { datetime: '', dateText: timeText };
  }
  const datetime = target.toISOString().slice(0, 19).replace('T', ' ');
  const dateText = `${target.getFullYear()}年${String(target.getMonth()+1).padStart(2,'0')}月${String(target.getDate()).padStart(2,'0')}日`;
  return { datetime, dateText };
}

function formatChinaDateTime(date) {
  const china = new Date(date.getTime() + 8 * 3600 * 1000);
  const y = china.getUTCFullYear(), mo = String(china.getUTCMonth()+1).padStart(2,'0');
  const d = String(china.getUTCDate()).padStart(2,'0'), h = String(china.getUTCHours()).padStart(2,'0');
  const mi = String(china.getUTCMinutes()).padStart(2,'0'), s = String(china.getUTCSeconds()).padStart(2,'0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function parseArticle($, element) {
  try {
    const $e = $(element);
    const $t = $e.find('h3 a');
    if ($t.length === 0) return null;
    const title = $t.text().trim();
    let url = $t.attr('href') || '';
    if (url.startsWith('/')) url = `https://weixin.sogou.com${url}`;
    const summary = $e.find('p.txt-info').text().trim();
    let datetime = '', dateText = '', source = '', timeDesc = '';
    const $sb = $e.find('.s-p');
    if ($sb.length > 0) {
      const $scr = $sb.find('.s2 script');
      if ($scr.length > 0) {
        const tm = $scr.text().match(/(\d{10})/);
        if (tm) {
          const d = new Date(parseInt(tm[1]) * 1000);
          datetime = formatChinaDateTime(d);
          dateText = `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日`;
          const diff = Date.now() - d.getTime();
          const days = Math.floor(diff / 86400000);
          const hours = Math.floor(diff / 3600000);
          if (days > 0) timeDesc = `${days}天前`;
          else if (hours > 0) timeDesc = `${hours}小时前`;
          else timeDesc = '刚刚';
        }
      }
      const $as = $sb.find('.all-time-y2');
      const $al = $sb.find('a.account');
      source = $as.length > 0 ? $as.text().trim() : ($al.length > 0 ? $al.text().trim() : '');
    }
    return { title, url, summary, datetime, date_text: dateText, date_description: timeDesc || dateText, source };
  } catch { return null; }
}

async function searchWechatArticles(query, maxResults = 10, resolveRealUrl = false) {
  maxResults = Math.min(maxResults, 50);
  const articles = [];
  let page = 1;
  const pagesNeeded = Math.ceil(maxResults / 10);
  while (articles.length < maxResults && page <= pagesNeeded) {
    try {
      const { cookieStr } = await getSogouCookie();
      const encoded = encodeURIComponent(query);
      const url = `https://weixin.sogou.com/weixin?query=${encoded}&s_from=input&_sug_=n&type=2&page=${page}&ie=utf8`;
      const html = await httpGet(url, cookieStr);
      const $ = cheerio.load(html);
      const $nl = $('ul.news-list');
      if ($nl.length === 0) break;
      let count = 0;
      $nl.find('li').each((_, el) => {
        if (articles.length >= maxResults) return false;
        const a = parseArticle($, el);
        if (a) { articles.push(a); count++; }
      });
      if (count === 0) break;
      page++;
      if (page <= pagesNeeded) await sleep(500 + Math.random() * 1000);
    } catch (e) {
      console.error(`第${page}页请求失败:`, e.message);
      break;
    }
  }

  const result = articles.slice(0, maxResults);
  if (resolveRealUrl && result.length > 0) {
    console.error('正在解析真实URL...');
    const { cookieObj } = await getSogouCookie();
    let success = 0;
    for (let i = 0; i < result.length; i++) {
      const a = result[i];
      console.error(`[${i+1}/${result.length}] 解析: ${a.title.slice(0,30)}...`);
      const real = await getRealUrl(a.url, cookieObj);
      const ok = !real.includes('weixin.sogou.com') && !real.includes('antispider');
      result[i] = { ...a, url: ok ? real : a.url, url_resolved: ok };
      if (ok) success++;
      if (i < result.length - 1) await sleep(500 + Math.random() * 1000);
    }
    console.error(`解析完成: 成功 ${success}, 失败 ${result.length - success}`);
  }
  return result;
}

// ==================== 全文提取 ====================

function extractArticleContent(html) {
  const $ = cheerio.load(html);

  // 标题
  const title = $('#activity-name').text().trim()
    || $('h1.rich_media_title').text().trim()
    || $('title').text().trim();

  // 公众号名称
  const account = $('#js_name').text().trim()
    || $('.rich_media_meta_text').first().text().trim();

  // 发布时间
  const pubTime = $('#publish_time').text().trim()
    || $('.rich_media_meta_text').eq(1).text().trim();

  // 正文：优先取 #js_content，这是微信文章的标准容器
  const $content = $('#js_content');
  if ($content.length > 0) {
    // 移除脚本、样式、无关元素
    $content.find('script, style, .rich_media_tool, .discuss_container, .rich_media_meta_link, .qr_code_pc, .rich_media_promo, .appmsg_card_context, .code-snippet__fix, .copy-btn').remove();
    // 获取纯文字，保留段落结构
    const paragraphs = [];
    $content.find('p, h1, h2, h3, h4, blockquote, li').each((_, el) => {
      const txt = $(el).text().trim();
      if (txt) paragraphs.push(txt);
    });
    // 如果段落提取太少，降级用全文
    const fullText = $content.text().replace(/\s*\n\s*/g, '\n').trim();
    return {
      title,
      account,
      pubTime,
      content: paragraphs.length > 3 ? paragraphs.join('\n\n') : fullText,
      contentHtml: $content.html() || '',
      wordCount: fullText.length,
    };
  }

  // 降级：直接取 body 文字
  const bodyText = $('body').text().replace(/\s*\n\s*/g, '\n').trim();
  return {
    title,
    account,
    pubTime,
    content: bodyText.slice(0, 10000),
    contentHtml: '',
    wordCount: bodyText.length,
  };
}

async function fetchArticleContent(url) {
  try {
    const headers = {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': getRandomUserAgent(),
      'Referer': 'https://mp.weixin.qq.com/',
    };
    const resp = await requestText({ url, headers, timeoutMs: 20000, retries: 1 });
    return extractArticleContent(resp.text);
  } catch (e) {
    return { error: e.message };
  }
}

// ==================== CLI & 主流程 ====================

function parseCliArgs(args) {
  let query = '';
  let num = 10;
  let output = '';
  let fetchFull = false;
  let resolveUrl = true; // 默认解析真实URL
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' || args[i] === '--num') { num = parseInt(args[i+1]) || 10; i++; }
    else if (args[i] === '-o' || args[i] === '--output') { output = args[i+1] || ''; i++; }
    else if (args[i] === '-f' || args[i] === '--fetch') { fetchFull = true; }
    else if (args[i] === '--no-resolve') { resolveUrl = false; }
    else if (!args[i].startsWith('-')) { query = args[i]; }
  }
  return { query, num, output, fetchFull, resolveUrl };
}

async function main() {
  const args = process.argv.slice(2);
  const { query, num, output, fetchFull, resolveUrl } = parseCliArgs(args);

  if (!query) {
    console.log(`
微信公众号文章搜索 + 全文提取工具

用法:
  node search_and_fetch.js <关键词> [选项]

选项:
  -n, --num <数量>       返回结果数量（默认10，最大50）
  -f, --fetch            提取文章全文内容（需先解析真实URL）
  -o, --output <文件>    输出JSON文件路径
  --no-resolve            不解析真实URL（速度更快，但链接是搜狗中转链接）

示例:
  node search_and_fetch.js "AI大模型" -n 10
  node search_and_fetch.js "道医养生" -n 5 -f
  node search_and_fetch.js "AI就业" -n 3 -f -o result.json
`);
    process.exit(0);
  }

  try {
    console.error(`正在搜索: "${query}"...`);
    const articles = await searchWechatArticles(query, num, resolveUrl);
    console.error(`搜索完成，共找到 ${articles.length} 篇文章`);

    if (fetchFull && articles.length > 0) {
      console.error('开始提取全文内容...');
      for (let i = 0; i < articles.length; i++) {
        const a = articles[i];
        console.error(`[${i+1}/${articles.length}] 提取: ${a.title.slice(0,30)}...`);
        const content = await fetchArticleContent(a.url);
        articles[i] = { ...a, fullContent: content };
        if (i < articles.length - 1) await sleep(800 + Math.random() * 1200);
      }
      console.error('全文提取完成');
    }

    const result = { query, total: articles.length, articles };
    const json = JSON.stringify(result, null, 2);
    if (output) {
      const fs = require('fs');
      fs.writeFileSync(output, json, 'utf-8');
      console.error(`结果已保存: ${output}`);
    }
    console.log(json);
  } catch (e) {
    console.error('执行失败:', e.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { searchWechatArticles, fetchArticleContent, extractArticleContent };
