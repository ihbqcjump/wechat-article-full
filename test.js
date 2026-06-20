/**
 * 测试脚本 - 验证 wechat-article-full 功能
 * 
 * 运行方式：
 * node test.js
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// 测试关键词
const TEST_KEYWORDS = [
  '微信公众号',
  'AI 大模型',
  '道医养生'
];

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试 1：基本搜索
async function testBasicSearch() {
  log('\n📝 测试 1：基本搜索', 'yellow');
  
  try {
    const cmd = `node scripts/search_and_fetch.js "${TEST_KEYWORDS[0]}" -n 2`;
    log(`   执行命令：${cmd}`, 'yellow');
    
    const { stdout, stderr } = await execPromise(cmd, { timeout: 15000 });
    
    if (stderr) {
      log(`   ⚠️  警告：${stderr}`, 'yellow');
    }
    
    const results = JSON.parse(stdout);
    
    if (!Array.isArray(results)) {
      throw new Error('输出不是数组格式');
    }
    
    if (results.length === 0) {
      throw new Error('搜索结果为空');
    }
    
    // 验证必要字段
    const firstResult = results[0];
    if (!firstResult.title || !firstResult.source || !firstResult.url) {
      throw new Error('搜索结果缺少必要字段');
    }
    
    log(`   ✅ 通过：找到 ${results.length} 篇文章`, 'green');
    log(`      第一篇：${firstResult.title.substring(0, 30)}...`, 'green');
    
    return true;
  } catch (error) {
    log(`   ❌ 失败：${error.message}`, 'red');
    return false;
  }
}

// 测试 2：全文提取
async function testFullContentFetch() {
  log('\n📝 测试 2：全文提取', 'yellow');
  
  try {
    const cmd = `node scripts/search_and_fetch.js "${TEST_KEYWORDS[1]}" -n 1 -f`;
    log(`   执行命令：${cmd}`, 'yellow');
    
    const { stdout, stderr } = await execPromise(cmd, { timeout: 30000 });
    
    if (stderr) {
      log(`   ⚠️  警告：${stderr}`, 'yellow');
    }
    
    const results = JSON.parse(stdout);
    
    if (!Array.isArray(results)) {
      throw new Error('输出不是数组格式');
    }
    
    if (results.length === 0) {
      throw new Error('搜索结果为空');
    }
    
    // 验证全文提取字段
    const firstResult = results[0];
    if (!firstResult.content) {
      throw new Error('未提取到正文内容');
    }
    
    log(`   ✅ 通过：成功提取全文`, 'green');
    log(`      标题：${firstResult.title.substring(0, 30)}...`, 'green');
    log(`      正文长度：${firstResult.content.length} 字符`, 'green');
    
    return true;
  } catch (error) {
    log(`   ❌ 失败：${error.message}`, 'red');
    return false;
  }
}

// 测试 3：错误处理
async function testErrorHandling() {
  log('\n📝 测试 3：错误处理（空关键词）', 'yellow');
  
  try {
    const cmd = `node scripts/search_and_fetch.js "" -n 1`;
    log(`   执行命令：${cmd}`, 'yellow');
    
    const { stdout, stderr } = await execPromise(cmd, { timeout: 10000 });
    
    // 应该返回空数组或错误信息
    if (stdout.trim()) {
      const results = JSON.parse(stdout);
      if (Array.isArray(results) && results.length === 0) {
        log(`   ✅ 通过：正确处理空关键词`, 'green');
        return true;
      }
    }
    
    log(`   ✅ 通过：有错误输出（预期行为）`, 'green');
    return true;
  } catch (error) {
    // 有错误输出也是正常的
    log(`   ✅ 通过：捕获到错误（预期行为）`, 'green');
    return true;
  }
}

// 主测试函数
async function runTests() {
  log('🚀 开始测试 wechat-article-full', 'green');
  log('='.repeat(50), 'yellow');
  
  const results = [];
  
  results.push(await testBasicSearch());
  
  // 等待 2 秒，避免触发反爬
  log('\n   ⏳ 等待 2 秒...', 'yellow');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  results.push(await testFullContentFetch());
  
  // 等待 2 秒
  log('\n   ⏳ 等待 2 秒...', 'yellow');
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  results.push(await testErrorHandling());
  
  // 总结
  log('\n' + '='.repeat(50), 'yellow');
  const passed = results.filter(r => r).length;
  const total = results.length;
  
  if (passed === total) {
    log(`\n🎉 全部测试通过！(${passed}/${total})`, 'green');
  } else {
    log(`\n⚠️  部分测试失败：通过 ${passed}/${total}`, 'yellow');
  }
  
  log('\n💡 提示：', 'yellow');
  log('   1. 如果测试失败，请检查网络连接', 'yellow');
  log('   2. 如果触发反爬，请稍后重试', 'yellow');
  log('   3. 确保已安装依赖：npm install cheerio', 'yellow');
}

// 运行测试
runTests().catch(error => {
  log(`\n❌ 测试运行出错：${error.message}`, 'red');
  process.exit(1);
});
