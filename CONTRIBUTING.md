# 🤝 贡献指南

感谢你考虑为 **wechat-article-full** 项目做出贡献！

## 🌟 如何贡献

### 1. 报告 Bug

如果你发现了 Bug，请：

1. 检查 [Issues](https://github.com/ihbqcjump/wechat-article-full/issues) 是否已有相同问题
2. 如果没有，创建新 Issue，并包含：
   - 清晰的问题描述
   - 复现步骤
   - 期望行为 vs 实际行为
   - 运行环境（Node.js 版本、操作系统等）
   - 相关日志或截图

### 2. 提出新功能

如果你有新功能建议，请：

1. 创建新 Issue，标签选择 `enhancement`
2. 详细描述功能需求和用例
3. 等待维护者讨论和确认

### 3. 提交代码

#### 步骤

1. **Fork 本仓库**
   ```bash
   # 在 GitHub 上点击 Fork 按钮
   ```

2. **克隆你的 Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/wechat-article-full.git
   cd wechat-article-full
   ```

3. **创建特性分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. **进行更改**
   - 遵循现有代码风格
   - 添加必要的注释
   - 更新文档（如需要）

5. **测试你的更改**
   ```bash
   node scripts/search_and_fetch.js "测试" -n 1 -f
   ```

6. **提交更改**
   ```bash
   git add .
   git commit -m "feat: add your feature"
   ```
   
   Commit 消息规范：
   - `feat:` 新功能
   - `fix:` Bug 修复
   - `docs:` 文档更新
   - `refactor:` 代码重构
   - `test:` 测试相关

7. **推送到你的 Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

8. **创建 Pull Request**
   - 前往原仓库
   - 点击「New Pull Request」
   - 填写 PR 描述
   - 等待审核

---

## 📋 代码规范

### JavaScript 风格

- 使用 `const` 和 `let`，避免 `var`
- 使用异步函数（`async/await`）
- 合理的错误处理
- 清晰的变量命名（小驼峰）
- 必要的代码注释

### 示例

```javascript
// ✅ 好的写法
const fetchArticleContent = async (url) => {
  try {
    const response = await fetch(url);
    const html = await response.text();
    return parseContent(html);
  } catch (error) {
    console.error('Failed to fetch article:', error.message);
    return null;
  }
};

// ❌ 避免的写法
var fetch = function(url){
  return fetch(url).then(r=>r.text()).then(t=>parse(t));
};
```

---

## 🧪 测试

在提交 PR 前，请确保：

1. **基本功能测试**
   ```bash
   # 测试基本搜索
   node scripts/search_and_fetch.js "测试" -n 3
   
   # 测试全文提取
   node scripts/search_and_fetch.js "测试" -n 1 -f
   ```

2. **边界情况测试**
   - 空关键词
   - 特殊字符
   - 大量结果（-n 20）
   - 网络异常

---

## 📝 文档更新

如果更改了 API 或功能，请同步更新：

- `README.md` - 主要功能和使用说明
- `SKILL.md` - 技能定义（如果修改了技能逻辑）
- 代码注释 - 复杂逻辑的解释

---

## 💬 社区行为准则

- 尊重所有贡献者
- 接受建设性批评
- 关注问题本身，而非人
- 保持友善和专业

---

## 📞 联系方式

如有疑问，请：

- 创建 [Issue](https://github.com/ihbqcjump/wechat-article-full/issues)
- 在 PR 中留言

---

## 🎉 感谢贡献者

感谢所有为这个项目做出贡献的开发者！

你的名字将出现在这里 ❤️

---

**再次感谢你的贡献！** 🚀
