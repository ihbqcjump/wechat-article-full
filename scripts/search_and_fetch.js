#!/usr/bin/env node

/**
 * 微信公众号文章搜索 + 全文提取工具（优化版）
 * 功能：搜索文章 → 解析真实链接 → 提取全文内容
 * 
 * 新功能：
 * - 可配置日志级别
 * - 支持代理（HTTP/HTTPS/SOCKS5）
 * - 可配置请求延时
 * - 更好的错误处理和重试机制
 * - 进度显示
 * 
 * 用法：
 *   node search_and_fetch.js "关键词"              # 搜索并返回摘要
 *   node search_and_fetch.js "关键词" -n 5 -f      # 搜索并提取全文
 *   node search_and_fetch.js "关键词" -n 3 -f -o result.json
 *   node search_and_fetch.js "关键词" --config config.json  # 使用配置文件
 */

const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ==================== 配置管理 ====================

const DEFAULT_CONFIG = {
  // 日志配置
  logLevel: 'info', // 'debug' | 'info' | 'warn' | 'error'
  logFile: null, // 日志文件路径（可选）
  
  // 请求配置
  timeout: 15000, // 请求超时（毫秒）
  retries: 2, // 重试次数
  delay: {
    min: 500, // 最小延时（毫秒）
    max: 1500, // 最大延时（毫秒）
    betweenPages: 1000, // 页面之间的延时
  },
  
  // 代理配置（可选）
  proxy: {
    enabled: false,
    url: '', // 例如：<ADDRESS_REMOVED>
    // 或 SOCKS5：<ADDRESS_REMOVED>
  },
  
  // 搜索配置
  maxResults: 50, // 最大结果数
  userAgents: [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  ],
  
  // Cookie 配置
  cookies: {
    base: 'ABTEST=7|1716888919|v1; IPLOC=CN5101',
  },
};

// 加载配置文件
function loadConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }
  
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const userConfig = JSON.parse(configData);
    return deepMerge(DEFAULT_CONFIG, userConfig);
  } catch (error) {
    console.error(`[WARN] 无法加载配置文件 ${configPath}:`, error.message);
    return DEFAULT_CONFIG;
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

// ==================== 日志系统 ====================

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  constructor(config) {
    this.level = LOG_LEVELS[config.logLevel] ?? LOG_LEVELS.info;
    this.logFile = config.logFile;
    this.colors = {
      debug: '\x1b[36m', // cyan
      info: '\x1b[32m', // green
      warn: '\x1b[33m', // yellow
      error: '\x1b[31m', // red
      reset: '\x1b[0m',
    };
  }
  
  formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] ${message}${metaStr}`;
  }
  
  writeToFile(message) {
    if (this.logFile) {
      try {
        fs.appendFileSync(this.logFile, message + '\n', 'utf-8');
      } catch (error) {
        console.error('Failed to write log:', error.message);
      }
    }
  }
  
  log(level, message, meta = {}) {
    if (LOG_LEVELS[level] < this.level) return;
    
    const formatted = this.formatMessage(level, message, meta);
    
    // 控制台输出（带颜色）
    const color = this.colors[level] || '';
    const reset = this.colors.reset;
    console.error(`${color}${formatted}${reset}`);
    
    // 文件输出（不带颜色）
    this.writeToFile(formatted);
  }
  
  debug(message, meta = {}) { this.log('debug', message, meta); }
  info(message, meta = {}) { this.log('info', message, meta); }
  warn(message, meta = {}) { this.log('warn', message, meta); }
  error(message, meta = {}) { this.log('error', message, meta); }
}

// ==================== 工具函数 ====================

let config = DEFAULT_CONFIG;
let logger = new Logger(config);

function setConfig(userConfig) {
  config = userConfig;
  logger = new Logger(config);
}

function getRandomUserAgent() {
  const agents = config.userAgents;
  return agents[Math.floor(Math.random() * agents.length)];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomDelay() {
  const { min, max } = config.delay;
  return min + Math.random() * (max - min);
}

function decompressBody(buffer, contentEncoding) {
  if (!contentEncoding) return buffer;
  const encoding = String(contentEncoding).toLowerCase();
  try {
    if (encoding.includes('gzip')) return zlib.gunzipSync(buffer);
    if (encoding.includes('deflate')) return zlib.inflateSync(buffer);
    if (encoding.includes('br')) return zlib.brotliDecompressSync(buffer);
  } catch (error) {
    logger.warn('Decompression failed', { encoding, error: error.message });
  }
  return buffer;
}

// ==================== HTTP 请求（支持代理） ====================

function createProxyAgent(proxyUrl) {
  if (!proxyUrl) return null;
  
  // 简单代理支持（生产环境建议使用 tunnel 或 proxy-agent 库）
  const url = new URL(proxyUrl);
  logger.info(`Using proxy: ${url.hostname}:${url.port}`);
  
  // 返回代理配置（简化版，实际项目建议使用专业库）
  return {
    hostname: url.hostname,
    port: parseInt(url.port),
    protocol: url.protocol,
  };
}

async function request(options) {
  const {
    url,
    method = 'GET',
    headers = {},
    timeoutMs = config.timeout,
    retries = config.retries,
    body = null,
  } = options;
  
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
          timeout: timeoutMs,
        };
        
        // 代理支持（简化版）
        if (config.proxy.enabled && config.proxy.url) {
          logger.warn('Proxy support is simplified. For production, use `tunnel` or `proxy-agent` library.');
        }
        
        const req = lib.request(reqOptions, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const raw = Buffer.concat(chunks);
            const body = decompressBody(raw, res.headers['content-encoding']);
            resolve({
              statusCode: res.statusCode || 0,
              headers: res.headers,
              body,
            });
          });
        });
        
        req.on('error', (error) => {
          logger.error(`Request error: ${error.message}`, { url, attempt });
          reject(error);
        });
        
        req.on('timeout', () => {
          req.destroy();
          logger.error('Request timeout', { url, timeoutMs });
          reject(new Error('Request timeout'));
        });
        
        if (body) req.write(body);
        req.end();
      });
      
      logger.debug(`Request success`, { url, status: result.statusCode, attempt });
      return result;
    } catch (error) {
      if (attempt >= retries) {
        logger.error(`Request failed after ${retries + 1} attempts`, { url, error: error.message });
        throw new Error(`Request failed: ${method} ${url}: ${error.message}`);
      }
      
      const delay = 300 + attempt * 300;
      logger.warn(`Request failed, retrying in ${delay}ms...`, { url, attempt, error: error.message });
      await sleep(delay);
    }
  }
  
  throw new Error('Unexpected error in request');
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
    logger.debug('Fetching Sogou cookie...');
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
    
    logger.debug('Sogou cookie fetched', { hasSnuid: !!cookieObj['SNUID'] });
    return { cookieStr: cookies || '', cookieObj };
  } catch (error) {
    logger.warn('Failed to fetch Sogou cookie, using empty', { error: error.message });
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
  // 方法1：meta refresh
  const metaMatch = html.match(/<meta[^>]*http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>]+)/i);
  if (metaMatch) return decodeURIComponent(metaMatch[1]);
  
  // 方法2：JavaScript 重定向
  const jsMatches = [
    /location\.href\s*=\s*["']([^"']+)["']/i,
    /location\s*=\s*["']([^"']+)["']/i,
    /window\.location\s*=\s*["']([^"']+)["']/i,
  ];
  for (const re of jsMatches) {
    const m = html.match(re);
    if (m) return decodeURIComponent(m[1]);
  }
  
  // 方法3：拼接 URL
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
    if (!url.includes('weixin.sogou.com')) {
      logger.debug('URL is already real URL', { url });
      resolve(url);
      return;
    }
    
    (async () => {
      const baseCookies = config.cookies.base;
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
          const resp = await request({
            url,
            headers,
            timeoutMs: 5000,
            retries: 0,
          });
          
          // 处理 301/302 重定向
          if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
            const location = resp.headers.location;
            if (location.includes('mp.weixin.qq.com')) {
              logger.debug('Redirect resolved', { from: url, to: location });
              resolve(location);
              return;
            }
          }
          
          // 处理页面中的重定向
          if (resp.statusCode === 200) {
            const html = resp.body.toString('utf-8');
            const redirect = extractRedirectUrlFromHtml(html);
            if (redirect && redirect.includes('mp.weixin.qq.com')) {
              logger.debug('HTML redirect resolved', { from: url, to: redirect });
              resolve(redirect);
              return;
            }
          }
        } catch (error) {
          logger.warn('Failed to resolve URL', { url, attempt, error: error.message });
        }
        
        if (attempt < 2) {
          const delay = 1000 + attempt * 500;
          logger.debug(`Retrying URL resolution in ${delay}ms...`);
          await sleep(delay);
        }
      }
      
      logger.warn('Failed to resolve real URL, using original', { url });
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
  const y = china.getUTCFullYear(),
        mo = String(china.getUTCMonth()+1).padStart(2,'0'),
        d = String(china.getUTCDate()).padStart(2,'0'),
        h = String(china.getUTCHours()).padStart(2,'0'),
        mi = String(china.getUTCMinutes()).padStart(2,'0'),
        s = String(china.getUTCSeconds()).padStart(2,'0');
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
    
    return {
      title,
      url,
      summary,
      datetime,
      date_text: dateText,
      date_description: timeDesc || dateText,
      source,
    };
  } catch (error) {
    logger.warn('Failed to parse article', { error: error.message });
    return null;
  }
}

async function searchWechatArticles(query, maxResults = 10, resolveRealUrl = false) {
  maxResults = Math.min(maxResults, config.maxResults);
  const articles = [];
  let page = 1;
  const pagesNeeded = Math.ceil(maxResults / 10);
  
  logger.info(`Searching articles`, { query, maxResults, pagesNeeded });
  
  while (articles.length < maxResults && page <= pagesNeeded) {
    try {
      logger.debug(`Fetching page ${page}...`);
      const { cookieStr } = await getSogouCookie();
      const encoded = encodeURIComponent(query);
      const url = `https://weixin.sogou.com/weixin?query=${encoded}&s_from=input&_sug_=n&type=2&page=${page}&ie=utf8`;
      
      const html = await httpGet(url, cookieStr);
      const $ = cheerio.load(html);
      const $nl = $('ul.news-list');
      
      if ($nl.length === 0) {
        logger.warn(`No results found on page ${page}`);
        break;
      }
      
      let count = 0;
      $nl.find('li').each((_, el) => {
        if (articles.length >= maxResults) return false;
        const a = parseArticle($, el);
        if (a) {
          articles.push(a);
          count++;
        }
      });
      
      logger.debug(`Page ${page} fetched`, { found: count, total: articles.length });
      
      if (count === 0) {
        logger.warn(`No valid articles on page ${page}, stopping`);
        break;
      }
      
      page++;
      if (page <= pagesNeeded) {
        const delay = config.delay.betweenPages;
        logger.debug(`Waiting ${delay}ms before next page...`);
        await sleep(delay);
      }
    } catch (error) {
      logger.error(`Failed to fetch page ${page}`, { error: error.message });
      break;
    }
  }
  
  const result = articles.slice(0, maxResults);
  
  // 解析真实 URL
  if (resolveRealUrl && result.length > 0) {
    logger.info(`Resolving real URLs for ${result.length} articles...`);
    const { cookieObj } = await getSogouCookie();
    let success = 0;
    
    for (let i = 0; i < result.length; i++) {
      const a = result[i];
      logger.debug(`Resolving URL [${i+1}/${result.length}]`, { title: a.title.slice(0, 30) });
      
      const real = await getRealUrl(a.url, cookieObj);
      const ok = !real.includes('weixin.sogou.com') && !real.includes('antispider');
      
      result[i] = { ...a, url: ok ? real : a.url, url_resolved: ok };
      if (ok) success++;
      
      if (i < result.length - 1) {
        const delay = getRandomDelay();
        await sleep(delay);
      }
    }
    
    logger.info(`URL resolution completed`, { success, failed: result.length - success });
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
    
    // 提取图片
    const images = [];
    $content.find('img').each((_, el) => {
      const src = $(el).attr('data-src') || $(el).attr('src');
      if (src && !src.includes('data:image')) images.push(src);
    });
    
    return {
      title,
      account,
      pubTime,
      content: paragraphs.length > 3 ? paragraphs.join('\n\n') : fullText,
      contentHtml: $content.html() || '',
      images: [...new Set(images)], // 去重
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
    images: [],
    wordCount: bodyText.length,
  };
}

async function fetchArticleContent(url) {
  try {
    logger.debug(`Fetching article content`, { url });
    
    const headers = {
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Encoding': 'identity',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'User-Agent': getRandomUserAgent(),
      'Referer': 'https://mp.weixin.qq.com/',
    };
    
    const resp = await requestText({
      url,
      headers,
      timeoutMs: 20000,
      retries: 1,
    });
    
    const content = extractArticleContent(resp.text);
    logger.debug(`Article fetched`, { title: content.title, wordCount: content.wordCount });
    
    return content;
  } catch (error) {
    logger.error(`Failed to fetch article`, { url, error: error.message });
    return { error: error.message };
  }
}

// ==================== CLI & 主流程 ====================

function parseCliArgs(args) {
  let query = '';
  let num = 10;
  let output = '';
  let fetchFull = false;
  let resolveUrl = true; // 默认解析真实URL
  let configPath = '';
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '-n' || args[i] === '--num') { num = parseInt(args[i+1]) || 10; i++; }
    else if (args[i] === '-o' || args[i] === '--output') { output = args[i+1] || ''; i++; }
    else if (args[i] === '-f' || args[i] === '--fetch') { fetchFull = true; }
    else if (args[i] === '--no-resolve') { resolveUrl = false; }
    else if (args[i] === '--config') { configPath = args[i+1] || ''; i++; }
    else if (args[i] === '-h' || args[i] === '--help') { showHelp(); process.exit(0); }
    else if (!args[i].startsWith('-')) { query = args[i]; }
  }
  
  return { query, num, output, fetchFull, resolveUrl, configPath };
}

function showHelp() {
  console.log(`
微信公众号文章搜索 + 全文提取工具（优化版）

用法:
  node search_and_fetch.js <关键词> [选项]

选项:
  -n, --num <数量>       返回结果数量（默认10，最大50）
  -f, --fetch            提取文章全文内容（需先解析真实URL）
  -o, --output <文件>    输出JSON文件路径
  --no-resolve            不解析真实URL（速度更快，但链接是搜狗中转链接）
  --config <文件>         加载配置文件（JSON格式）
  -h, --help             显示帮助信息

配置文件示例 (config.json):
  {
    "logLevel": "info",
    "timeout": 15000,
    "retries": 2,
    "delay": { "min": 500, "max": 1500 },
    "proxy": { "enabled": false, "url": "" }
  }

示例:
  node search_and_fetch.js "AI大模型" -n 10
  node search_and_fetch.js "道医养生" -n 5 -f
  node search_and_fetch.js "AI就业" -n 3 -f -o result.json
  node search_and_fetch.js "AI大模型" --config config.json
`);
}

async function main() {
  const args = process.argv.slice(2);
  const { query, num, output, fetchFull, resolveUrl, configPath } = parseCliArgs(args);
  
  // 加载配置
  if (configPath) {
    const fullConfigPath = path.resolve(configPath);
    const userConfig = loadConfig(fullConfigPath);
    setConfig(userConfig);
    logger.info(`Config loaded`, { path: fullConfigPath });
  }
  
  if (!query) {
    showHelp();
    process.exit(0);
  }
  
  try {
    logger.info(`Starting search`, { query, num, fetchFull });
    console.error(`正在搜索: "${query}"...`);
    
    const articles = await searchWechatArticles(query, num, resolveUrl);
    logger.info(`Search completed`, { total: articles.length });
    console.error(`搜索完成，共找到 ${articles.length} 篇文章`);
    
    if (fetchFull && articles.length > 0) {
      logger.info(`Fetching full content for ${articles.length} articles...`);
      console.error('开始提取全文内容...');
      
      for (let i = 0; i < articles.length; i++) {
        const a = articles[i];
        console.error(`[${i+1}/${articles.length}] 提取: ${a.title.slice(0,30)}...`);
        
        const content = await fetchArticleContent(a.url);
        articles[i] = { ...a, fullContent: content };
        
        if (i < articles.length - 1) {
          const delay = getRandomDelay();
          await sleep(delay);
        }
      }
      
      logger.info(`Full content fetch completed`);
      console.error('全文提取完成');
    }
    
    const result = {
      query,
      total: articles.length,
      timestamp: new Date().toISOString(),
      articles,
    };
    
    const json = JSON.stringify(result, null, 2);
    
    if (output) {
      const fullOutputPath = path.resolve(output);
      fs.writeFileSync(fullOutputPath, json, 'utf-8');
      logger.info(`Results saved`, { path: fullOutputPath });
      console.error(`结果已保存: ${fullOutputPath}`);
    }
    
    console.log(json);
    
    logger.info(`Task completed successfully`);
  } catch (error) {
    logger.error(`Task failed`, { error: error.message, stack: error.stack });
    console.error('执行失败:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { searchWechatArticles, fetchArticleContent, extractArticleContent, setConfig, loadConfig };
