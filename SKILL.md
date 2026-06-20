---
name: wechat-article-full
description: "微信公众号文章搜索 + 全文提取。搜索关键词获取文章列表，自动解析真实链接，并提取完整正文内容。适用于竞品分析、热点追踪、内容参考等场景。"
description_zh: "搜索微信公众号文章并提取完整正文内容"
description_en: "Search WeChat public account articles and extract full article content"
version: 1.0.0
allowed-tools: Bash,Read,Write
metadata:
  clawdbot:
    emoji: "\U0001F4DC"
    requires:
      bins:
        - node
display_name: "wechat-article-full"
display_name_en: "wechat-article-full"
visibility: "public"
---

# 微信公众号文章搜索 + 全文提取

## 适用场景

- 用户说"帮我搜某关键词的公众号文章，并提取全文"
- 竞品公众号内容分析
- 热点文章追踪与内容参考
- 需要文章标题、摘要、全文、发布时间、来源账号的完整数据

## 工作流程

### 步骤1：安装依赖

```bash
cd "SKILL_DIR" && npm install cheerio
```

> SKILL_DIR 为当前技能所在目录（scripts 的上一级）

### 步骤2：执行搜索 + 全文提取

```bash
# 仅搜索（返回标题、摘要、链接、来源、时间）
node "SKILL_DIR/scripts/search_and_fetch.js" "关键词" -n 10

# 搜索 + 提取全文
node "SKILL_DIR/scripts/search_and_fetch.js" "关键词" -n 5 -f

# 搜索 + 全文 + 保存结果到文件
node "SKILL_DIR/scripts/search_and_fetch.js" "关键词" -n 10 -f -o result.json
```

## 参数说明

- `query`：搜索关键词（必填）
- `-n, --num`：返回数量（默认 10，最大 50）
- `-f, --fetch`：提取文章全文内容（会自动先解析真实 URL）
- `-o, --output`：输出 JSON 文件路径（可选）
- `--no-resolve`：不解析真实 URL（速度更快，但链接是搜狗中转链接）

## 输出字段

每条文章包含：
- `title`：文章标题
- `url`：文章链接（解析后为微信原文链接）
- `summary`：文章摘要
- `datetime` / `date_text` / `date_description`：发布时间
- `source`：来源公众号名称
- `url_resolved`：是否成功解析为真实链接
- `fullContent`（加 `-f` 时）：全文内容对象，含 `title`、`account`、`pubTime`、`content`、`wordCount`

## 注意事项

- 搜狗微信有反爬限制，解析真实 URL 偶尔会失败，属于正常情况
- 提取全文时请求间隔约 1-2 秒，避免被封
- 本工具仅用于学习和研究目的
