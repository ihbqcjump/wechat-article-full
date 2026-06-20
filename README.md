# 微信公众号文章搜索 + 全文提取

🔍 按关键词搜索微信公众号文章，自动解析真实链接，并提取完整正文内容。

## ✨ 功能特性

- **智能搜索**：通过搜狗微信搜索，按关键词查找公众号文章
- **真实链接解析**：自动解析搜狗中转链接，获取微信原文真实 URL
- **全文提取**：直接读取文章内容，提取完整正文（标题、作者、正文、图片）
- **命令行友好**：支持参数化调用，方便集成到各种 AI Agent

## 🚀 快速开始

### 安装依赖

```bash
npm install cheerio
```

### 基本搜索

```bash
node scripts/search_and_fetch.js "关键词" -n 5
```

### 搜索并提取全文

```bash
node scripts/search_and_fetch.js "关键词" -n 3 -f
```

## 📖 参数说明

| 参数 | 说明 | 示例 |
|------|------|------|
| 位置参数 | 搜索关键词（必填） | `"AI 大模型"` |
| `-n, --num` | 返回文章数量（默认 5） | `-n 10` |
| `-r, --resolve` | 解析真实链接（默认开启） | `-r` |
| `-f, --fetch` | 提取全文内容 | `-f` |

## 📋 输出示例

### 基本搜索（不带 `-f`）

```json
[
  {
    "title": "完全免费的模型市场iFlow CLI",
    "summary": "让写代码像聊天一样简单...",
    "source": "lucky-阿林",
    "time": "2026-02-28",
    "url": "https://mp.weixin.qq.com/s/xxxx",
    "searchUrl": "https://weixin.sogou.com/..."
  }
]
```

### 全文提取（带 `-f`）

```json
[
  {
    "title": "完全免费的模型市场iFlow CLI",
    "author": "lucky-阿林",
    "content": "完整正文内容...",
    "images": ["图片URL1", "图片URL2"],
    "url": "https://mp.weixin.qq.com/s/xxxx"
  }
]
```

## 🔧 技术原理

1. **搜索阶段**：调用搜狗微信搜索 API，获取文章列表
2. **链接解析阶段**：访问搜狗中转链接，提取微信原文 URL
3. **内容提取阶段**：使用 Cheerio 解析微信文章页面，提取正文、标题、作者、图片等

## ⚠️ 注意事项

- 搜狗微信搜索有反爬限制，频繁请求可能触发验证码
- 部分文章可能有访问限制，导致解析失败
- 建议合理控制请求频率，避免被封 IP

## 📦 集成到 AI Agent

本技能可作为 Skill 集成到各种 AI Agent 平台：

### 集成到 WorkBuddy / SkillHub

1. 将本仓库下载到技能的 `scripts/` 目录
2. 安装依赖：`npm install cheerio`
3. 在 `SKILL.md` 中配置调用方式

### 集成到 OpenClaw / Hermes

1. 将技能文件夹放入 Agent 的技能目录
2. 确保 `node` 可用
3. 通过自然语言触发：「搜索公众号文章 XXX」

## 📄 许可证

MIT License

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## ✨ 作者

Created by [ihbqcjump](https://github.com/ihbqcjump)

---

**如果这个项目对你有帮助，请给个 ⭐️ Star！**
