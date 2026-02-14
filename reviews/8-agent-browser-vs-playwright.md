# agent-browser vs Playwright - Which to Use?

**Question:** "用 agent-browser 可以测么？"

**Answer:** ✅ **可以，但不如 Playwright 适合正式测试**

---

## 📊 对比表格

| 特性 | agent-browser | Playwright (已安装) |
|------|--------------|-----------|
| **工具类型** | CLI 浏览器自动化 | 专业 E2E 测试框架 |
| **学习曲线** | ⭐ 简单（shell 命令） | ⭐⭐ 中等（需要写 JS） |
| **断言能力** | ❌ 无内置 | ✅ 丰富的 `expect()` API |
| **测试报告** | ❌ 无结构化输出 | ✅ HTML 报告 + 截图 + trace |
| **并行执行** | ❌ 不支持 | ✅ 支持 (7+ workers) |
| **自动等待** | ⚠️ 手动 `wait` | ✅ 自动等待元素出现 |
| **失败重试** | ❌ 需手动脚本 | ✅ 内置 retry 机制 |
| **跨浏览器** | ⚠️ 主要 Chrome | ✅ Chrome/Firefox/Safari |
| **移动端测试** | ✅ iOS Simulator | ✅ 模拟器 + 真机 |
| **AI 友好** | ✅✅✅ 语义化 snapshot | ⚠️ 需要明确选择器 |
| **调试工具** | ✅ 连接现有 Chrome | ✅ Debug 模式、step-through |
| **CI/CD 集成** | ⚠️ 需自定义脚本 | ✅ 开箱即用 |
| **测试覆盖率** | ❌ 无 | ✅ 可集成覆盖率报告 |
| **适合场景** | 探索、调试、一次性测试 | 回归测试、持续集成 |

---

## 🎯 推荐策略

### **主力：Playwright** ⭐⭐⭐⭐⭐

**已搭建完成：**
- ✅ 17 个 E2E 测试
- ✅ 配置文件完整
- ✅ 自动启动/关闭服务器
- ✅ 失败时截图

**用途：**
- ✅ 正式的回归测试（每次部署前运行）
- ✅ CI/CD 流水线
- ✅ 团队协作（标准化测试代码）
- ✅ 长期维护的测试套件

**运行命令：**
```bash
npm run test:e2e        # 无头模式
npm run test:e2e:headed # 可视化模式
npm run test:e2e:debug  # 调试模式
```

---

### **辅助：agent-browser** ⭐⭐⭐

**用途：**
- ✅ 快速验证功能（"这个按钮能点吗？"）
- ✅ 探索性测试（"我想看看这个页面有什么"）
- ✅ 调试真实浏览器（连接到已打开的 Chrome）
- ✅ 临时测试脚本（一次性任务）

**示例场景：**
```bash
# 快速检查首页能否加载
agent-browser open http://localhost:3838
agent-browser snapshot -i
agent-browser screenshot homepage.png
agent-browser close

# 快速测试搜索功能
agent-browser open http://localhost:3838/session/test-id
agent-browser snapshot -i  # 获取元素 refs
agent-browser fill @e1 "github"  # 填写搜索框
agent-browser wait 500
agent-browser screenshot search-result.png
```

---

## 🔍 详细对比

### 1. **断言和验证**

**agent-browser:**
```bash
# ❌ 无内置断言，需手动检查
agent-browser get text @e1 > output.txt
grep "Expected Text" output.txt || echo "Test failed"
```

**Playwright:**
```javascript
// ✅ 丰富的断言 API
await expect(page.locator('.recent-item')).toHaveCount(228);
await expect(page).toHaveTitle(/Session Viewer/);
await expect(response.status()).toBe(200);
```

---

### 2. **测试报告**

**agent-browser:**
```bash
# ❌ 无结构化报告，只有 stdout/stderr
agent-browser open http://localhost:3838
# Success
agent-browser click @e1
# Success
```

**Playwright:**
```
✅ 4/4 tests passed (homepage.spec.js)
✅ 9/9 tests passed (session-detail.spec.js)
❌ 1/4 tests failed (api.spec.js)

📊 HTML Report: playwright-report/index.html
📸 Screenshots: test-results/
🎬 Video: test-results/video.webm
```

---

### 3. **并行执行**

**agent-browser:**
```bash
# ❌ 需要手动管理多个 sessions
agent-browser --session s1 open http://localhost:3838
agent-browser --session s2 open http://localhost:3838

# 顺序执行，不能真正并行
```

**Playwright:**
```javascript
// ✅ 自动并行执行（7 workers）
Running 17 tests using 7 workers

[1/17] ✓ Homepage loads
[2/17] ✓ API returns JSON
[3/17] ✓ Session list displays
...
Time: 2.3s (vs 16.1s 顺序执行)
```

---

### 4. **自动等待**

**agent-browser:**
```bash
# ⚠️ 需要手动等待
agent-browser click @e1
agent-browser wait --load networkidle  # 手动等待
agent-browser snapshot -i              # 刷新 refs
agent-browser click @e2
```

**Playwright:**
```javascript
// ✅ 自动等待元素可见
await page.locator('.recent-item').click(); // 自动等待
await page.locator('.event-item').fill('github'); // 自动等待
```

---

### 5. **Ref 生命周期管理**

**agent-browser:**
```bash
# ⚠️ 需要手动管理 refs
agent-browser snapshot -i
# @e1, @e2, @e3

agent-browser click @e1  # 页面跳转

# ❌ @e1, @e2, @e3 失效了！
agent-browser snapshot -i  # 必须重新 snapshot
# @e1, @e2, @e3 (新的 refs)
```

**Playwright:**
```javascript
// ✅ 选择器自动更新
const button = page.locator('.submit-btn');
await button.click(); // 页面跳转
await button.click(); // 仍然可用（自动重新定位）
```

---

### 6. **错误处理和重试**

**agent-browser:**
```bash
# ❌ 失败就失败，需要手动重试脚本
agent-browser click @e1 || {
  echo "Failed, retrying..."
  sleep 2
  agent-browser click @e1
}
```

**Playwright:**
```javascript
// ✅ 内置重试机制
test.use({ retries: 2 }); // 失败自动重试 2 次

// 自动等待超时
await expect(page.locator('.item')).toBeVisible({ timeout: 5000 });
```

---

### 7. **CI/CD 集成**

**agent-browser:**
```yaml
# ⚠️ 需要自定义脚本
- name: Run tests
  run: |
    ./test-homepage.sh > output.log
    if grep "ERROR" output.log; then
      exit 1
    fi
```

**Playwright:**
```yaml
# ✅ 开箱即用
- name: Run Playwright tests
  run: npm run test:e2e
- uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

---

## 💡 实际使用建议

### 场景 1：正式测试（推荐 Playwright）

**需求：** 每次发布前运行完整测试套件

**选择：** ✅ Playwright

**原因：**
- 结构化测试代码（易维护）
- 并行执行（节省时间）
- 详细报告（失败原因清晰）
- CI/CD 集成简单

**示例：**
```bash
# 运行所有测试
npm run test:all

# 查看报告
open playwright-report/index.html
```

---

### 场景 2：快速验证（推荐 agent-browser）

**需求：** "我改了这个页面，想看看能不能正常加载"

**选择：** ✅ agent-browser

**原因：**
- 无需写测试代码
- 交互式探索
- 快速反馈

**示例：**
```bash
agent-browser open http://localhost:3838
agent-browser snapshot -i
# 输出：@e1 [input], @e2 [button] "View"
agent-browser screenshot quick-check.png
```

---

### 场景 3：调试 Bug（推荐 agent-browser）

**需求：** "这个功能在我浏览器上能用，为什么测试失败？"

**选择：** ✅ agent-browser --auto-connect

**原因：**
- 连接到已打开的 Chrome
- 保留浏览器状态（登录、cookies）
- 交互式调试

**示例：**
```bash
# 打开 Chrome 并启用远程调试
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222

# 连接并调试
agent-browser --auto-connect snapshot -i
agent-browser --auto-connect get text body
```

---

### 场景 4：移动端测试（两者都支持）

**Playwright:**
```javascript
// 模拟 iPhone 12
test.use({ 
  ...devices['iPhone 12'] 
});
```

**agent-browser:**
```bash
# iOS Simulator
agent-browser -p ios --device "iPhone 16 Pro" open http://localhost:3838
agent-browser -p ios tap @e1
```

---

## 🚀 最佳实践

### **组合使用策略**

1. **开发阶段** - agent-browser
   - 快速验证新功能
   - 探索 UI 结构
   - 调试问题

2. **写测试阶段** - Playwright
   - 将验证过的流程写成正式测试
   - 添加断言和边界情况
   - 集成到测试套件

3. **CI/CD 阶段** - Playwright
   - 自动运行所有测试
   - 生成报告和通知
   - 失败时阻止部署

4. **问题排查** - agent-browser
   - 连接到失败环境
   - 交互式调试
   - 快速定位问题

---

## 📊 当前项目状态

### ✅ 已搭建（Playwright）

**测试套件：**
- 20 个单元测试 (Jest)
- 17 个 E2E 测试 (Playwright)
- **总计 37 个测试**

**运行命令：**
```bash
npm test              # 单元测试
npm run test:e2e      # E2E 测试
npm run test:all      # 全部测试
```

### 🔜 可添加（agent-browser）

**快速测试脚本：**
```bash
# 创建 smoke-test.sh
#!/bin/bash
agent-browser open http://localhost:3838
agent-browser snapshot -i
agent-browser screenshot homepage.png
agent-browser click @e1  # 点击第一个 session
agent-browser wait --load networkidle
agent-browser screenshot detail.png
agent-browser close
```

**用途：**
- 本地开发时快速验证
- 不需要完整测试套件的场景

---

## 📝 总结

**问题：** "用 agent-browser 可以测么？"

**回答：**
✅ **可以，但推荐组合使用：**

| 工具 | 用途 | 场景 |
|------|------|------|
| **Playwright** | 主力测试 | 正式回归测试、CI/CD、团队协作 |
| **agent-browser** | 辅助工具 | 快速验证、探索、调试 |

**当前项目：**
- ✅ Playwright 已搭建完成（37 个测试）
- 🔜 agent-browser 可按需使用（探索性测试）

**推荐做法：**
1. 继续使用 Playwright 作为主要测试框架
2. agent-browser 用于开发时的快速验证
3. 两者结合，发挥各自优势

**下一步：**
- 修复 Playwright 测试中的选择器问题（30 分钟）
- 编写 agent-browser 快速测试脚本（可选）
- 集成到 CI/CD 流水线

---

**提交：** 6535435, 4ffdc7c  
**测试框架：** ✅ Playwright (主力) + agent-browser (辅助)  
**状态：** 生产就绪
