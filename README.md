# 🔍 微信公众号文章搜索 + 全文提取

> 按关键词搜索微信公众号文章，自动解析真实链接，并提取完整正文内容。适用于竞品分析、热点追踪、内容参考等场景。

[![NPM Version](https://img.shields.io/badge/npm-v1.0.0-blue.svg)](https://www.npmjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](https://opensource.org/licenses/MIT)
[![GitHub stars](https://img.shields.io/github/stars/ihbqcjump/wechat-article-full?style=social)](https://github.com/ihbqcjump/wechat-article-full)
[![GitHub forks](https://img.shields.io/github/forks/ihbqcjump/wechat-article-full?style=social)](https://github.com/ihbqcjump/wechat-article-full/fork)
[![GitHub issues](https://img.shields.io/github/issues/ihbqcjump/wechat-article-full)](https://github.com/ihbqcjump/wechat-article-full/issues)
[![GitHub last commit](https://img.shields.io/github/last-commit/ihbqcjump/wechat-article-full)](https://github.com/ihbqcjump/wechat-article-full)

---

## 📖 目录

- [✨ 功能特性](#-功能特性)
- [🚀 快速开始](#-快速开始)
- [📖 使用指南](#-使用指南)
- [📋 输出示例](#-输出示例)
- [🤖 集成到 AI Agent](#-集成到-ai-agent)
- [🔧 技术原理](#-技术原理)
- [⚠️ 注意事项](#️-注意事项)
- [🐛 常见问题](#-常见问题)
- [🤝 贡献](#-贡献)
- [📄 许可证](#-许可证)

---

## ✨ 功能特性

- ✅ **智能搜索**：通过搜狗微信搜索，按关键词查找公众号文章
- ✅ **真实链接解析**：自动解析搜狗中转链接，获取微信原文真实 URL
- ✅ **全文提取**：直接读取文章内容，提取完整正文（标题、作者、正文、图片）
- ✅ **命令行友好**：支持参数化调用，方便集成到各种 AI Agent
- ✅ **批量处理**：支持一次搜索多篇文章并提取全文
- ✅ **JSON 输出**：结构化输出，方便程序化调用

---

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/ihbqcjump/wechat-article-full.git
cd wechat-article-full
```

### 2. 安装依赖

```bash
npm install cheerio
```

### 3. 基本搜索

```bash
node scripts/search_and_fetch.js "关键词" -n 5
```

### 4. 搜索并提取全文

```bash
node scripts/search_and_fetch.js "关键词" -n 3 -f
```

---

## 📖 使用指南

### 参数说明

| 参数 | 说明 | 默认值 | 示例 |
|------|------|--------|------|
| 位置参数 | 搜索关键词（必填） | - | `"AI 大模型"` |
| `-n, --num` | 返回文章数量 | `5` | `-n 10` |
| `-r, --resolve` | 解析真实链接 | `true` | `-r` |
| `-f, --fetch` | 提取全文内容 | `false` | `-f` |

### 使用示例

#### 示例 1：基本搜索（只返回文章列表）

```bash
node scripts/search_and_fetch.js "道医养生" -n 3
```

输出：
```json
[
  {
    "title": "道医养生｜二十四节气养生指南",
    "summary": "道医养生智慧，顺应自然规律...",
    "source": "道医养生堂",
    "time": "2026-01-15",
    "url": "https://mp.weixin.qq.com/s/xxxx",
    "searchUrl": "https://weixin.sogou.com/..."
  }
]
```

#### 示例 2：搜索并提取全文

```bash
node scripts/search_and_fetch.js "OpenClaw 免费模型" -n 1 -f
```

输出：
```json
[
  {
    "title": "盘点 openclaw 可免费调用的模型",
    "author": "井底的青蛙",
    "content": "完整正文内容...（支持 Markdown 格式）",
    "images": ["https://mmbiz.qpic.cn/..."],
    "url": "https://mp.weixin.qq.com/s/xxxx",
    "source": "井底的青蛙",
    "time": "2026-03-10"
  }
]
```

#### 示例 3：批量提取多篇文章

```bash
node scripts/search_and_fetch.js "AI 写作技巧" -n 5 -f > articles.json
```

---

## 📋 输出示例

### 基本搜索模式（不带 `-f`）

返回文章列表，包含标题、摘要、来源、时间、链接：

```json
[
  {
    "title": "完全免费的模型市场iFlow CLI：让写代码像聊天一样简单",
    "summary": "介绍 iFlow CLI 的使用方法和免费模型调用...",
    "source": "lucky-阿林",
    "time": "2026-02-28",
    "url": "https://mp.weixin.qq.com/s/abc123...",
    "searchUrl": "https://weixin.sogou.com/link?..."
  }
]
```

### 全文提取模式（带 `-f`）

返回完整文章内容，包含标题、作者、正文、图片：

```json
[
  {
    "title": "完全免费的模型市场iFlow CLI",
    "author": "lucky-阿林",
    "content": "## 引言\n\niFlow CLI 是一个...\n\n## 核心功能\n\n1. 免费调用...\n\n![截图](https://mmbiz.qpic.cn/...)",
    "images": [
      "https://mmbiz.qpic.cn/...",
      "https://mmbiz.qpic.cn/..."
    ],
    "url": "https://mp.weixin.qq.com/s/abc123...",
    "source": "lucky-阿林",
    "time": "2026-02-28"
  }
]
```

---

## 🤖 集成到 AI Agent

本技能可作为 Skill 集成到各种 AI Agent 平台：

### 集成到 WorkBuddy / SkillHub

1. 在 SkillHub 市场搜索 `wechat-article-full`
2. 一键安装
3. 在对话中说：「搜索公众号文章 XXX」

### 集成到 OpenClaw / Hermes

1. 将技能文件夹放入 Agent 的技能目录
2. 确保 `node` 可用
3. 通过自然语言触发：「搜索公众号文章 XXX」

### 集成到自定义 Agent

```javascript
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function searchWechatArticles(keyword, options = {}) {
  const { num = 5, fetchFull = false } = options;
  const cmd = `node scripts/search_and_fetch.js "${keyword}" -n ${num} ${fetchFull ? '-f' : ''}`;
  
  const { stdout } = await execPromise(cmd);
  return JSON.parse(stdout);
}
```

---

## 🔧 技术原理

### 工作流程

```
┌─────────────────┐
│  用户输入关键词（如："道医养生"）                │
└─────────────────┘
                    ↓
┌─────────────────┐
│  1. 搜索阶段                                    │
│     - 调用搜狗微信搜索 API                      │
│     - 获取文章列表（标题、摘要、来源、链接）  │
└─────────────────┘
                    ↓
┌─────────────────┐
│  2. 链接解析阶段                                │
│     - 访问搜狗中转链接                          │
│     - 提取微信原文真实 URL                      │
└─────────────────┘
                    ↓
┌─────────────────┐
│  3. 内容提取阶段（可选，-f 参数）             │
│     - 使用 Cheerio 解析微信文章页面            │
│     - 提取正文、标题、作者、图片等            │
└─────────────────┘
                    ↓
┌─────────────────┐
│  输出 JSON 格式结果                            │
└─────────────────┘
```

### 核心技术

- **搜狗微信搜索 API**：`https://weixin.sogou.com/weixin?type=2&query={keyword}`
- **Cheerio**：服务器端 jQuery，用于解析 HTML
- **Node.js**：运行时环境

---

## ⚠️ 注意事项

1. **反爬限制**：搜狗微信搜索有反爬机制，频繁请求可能触发验证码
2. **访问限制**：部分文章可能有访问限制，导致解析失败
3. **请求频率**：建议合理控制请求频率（建议使用延时），避免被封 IP
4. **法律合规**：请遵守相关法律法规，不要用于非法用途
5. **内容版权**：提取的内容仅供个人学习研究，请勿侵犯原作者版权

---

## 🐛 常见问题

### Q1：搜索结果为空？

**A**：可能是以下原因：
- 关键词太冷门，没有相关文章
- 网络问题，无法访问搜狗微信搜索
- 触发了反爬限制，建议稍后重试

### Q2：解析真实链接失败？

**A**：可能是以下原因：
- 搜狗链接已过期
- 文章已被删除
- 网络问题，无法访问中转链接

### Q3：提取全文失败？

**A**：可能是以下原因：
- 微信文章页面结构发生变化
- 文章需要登录才能查看
- 网络问题，无法访问微信文章页面

### Q4：如何避免触发反爬限制？

**A**：
- 控制请求频率（建议每次请求间隔 2-3 秒）
- 使用代理 IP（如需大规模爬取）
- 避免短时间内大量请求

---

## 🤝 贡献

欢迎贡献代码、提出建议或报告问题！

### 贡献步骤

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

### 贡献规范

- 遵循现有代码风格
- 提交前运行测试
- 写清楚 commit message

---

## 📄 许可证

本项目采用 **MIT License** 开源许可证。

详见 [LICENSE](LICENSE) 文件。

---

## ✨ 作者

Created by [ihbqcjump](https://github.com/ihbqcjump)

---

## 🌟 支持本项目

如果这个项目对你有帮助，请给个 ⭐️ Star！

你的支持是我持续维护的动力 ❤️

---

## 📞 联系方式

- GitHub Issues：[提交问题](https://github.com/ihbqcjump/wechat-article-full/issues)
- Email：欢迎通过 GitHub 联系我

---

**Happy Coding! 🚀**
