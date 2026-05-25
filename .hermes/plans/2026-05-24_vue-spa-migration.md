# v0.4.0 Vue SPA Migration Plan

## Goal
将 copilot-session-viewer 从 Express+EJS 多页应用迁移为 Vue 3 SPA + Vite + Tailwind CSS，后端 Express 精简为纯 API 服务。

## Current State
- **后端**: Express + EJS 模板渲染，16 个路由（4 page + 12 API）
- **前端**: 6 个 JS 文件（5,353 行），esbuild 打包为 IIFE
- **模板**: 4 个 EJS 文件（3,341 行），CSS 内联在 `<style>` 标签中
- **CDN**: Vue 3、vue-virtual-scroller、marked、DOMPurify 从 `public/vendor/` 加载
- **session-detail.js** 已用 Vue 3（CDN），其余页面是 vanilla JS

## Target Architecture
```
src/
  frontend/           → 删除（被 src/client/ 替代）
  client/
    main.js           # Vue app 入口
    App.vue           # 根组件 + router-view
    router.js         # vue-router 配置
    assets/
      main.css        # Tailwind 入口
    composables/      # 可复用逻辑（从 time-analyze.js 等提取）
    components/
      common/         # 跨页面共享组件
      home/           # Homepage 组件
      session/        # Session Detail 组件
      timeline/       # Time Analyze 组件
    views/
      HomeView.vue
      SessionView.vue
      TimeAnalyzeView.vue
  app.js              # Express（纯 API，不渲染 EJS）
views/                → 删除
public/
  vendor/             → 删除（npm 包替代 CDN）
vite.config.js
tailwind.config.js
postcss.config.js
```

---

## Phase 0: 分支与脚手架

### 0.1 创建分支
- `git checkout -b feat/vue-spa main`
- 更新 `package.json` version → `0.4.0`

### 0.2 安装依赖
**新增 dependencies:**
- `vue` ^3.5
- `vue-router` ^4.5
- `vue-virtual-scroller` ^2.0（npm 包替代 CDN）
- `marked` ^15（npm 包替代 CDN）
- `dompurify`（已有）

**新增 devDependencies:**
- `vite` ^6
- `@vitejs/plugin-vue` ^5
- `tailwindcss` ^4
- `@tailwindcss/vite` ^4
- `autoprefixer`
- `postcss`

**移除:**
- `esbuild`（被 Vite 替代）
- `ejs`（不再服务端渲染）

### 0.3 Vite 配置
创建 `vite.config.js`:
```js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3838',
      '/session': {
        target: 'http://localhost:3838',
        // 只代理 API 路由（export, import, insight, share）
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // 只转发 POST/PUT/DELETE 和特定 GET（export/share/insight）
          })
        }
      }
    }
  }
})
```

### 0.4 Tailwind 配置
创建 `src/client/assets/main.css`:
```css
@import "tailwindcss";
```

### 0.5 SPA 入口 HTML
创建 `src/client/index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Session Viewer</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/main.js"></script>
</body>
</html>
```

### 0.6 Vue App 入口
创建 `src/client/main.js`:
```js
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'
import './assets/main.css'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/HomeView.vue') },
    { path: '/session/:id', component: () => import('./views/SessionView.vue') },
    { path: '/session/:id/time-analyze', component: () => import('./views/TimeAnalyzeView.vue') },
  ]
})

createApp(App).use(router).mount('#app')
```

### 0.7 更新 npm scripts
```json
{
  "dev": "concurrently \"vite --config vite.config.js\" \"cross-env DISABLE_TELEMETRY=true nodemon server.js\"",
  "build": "vite build --config vite.config.js",
  "build:prod": "vite build --config vite.config.js",
  "start": "cross-env DISABLE_TELEMETRY=true node server.js",
  "preview": "vite preview --config vite.config.js"
}
```

---

## Phase 1: 后端改造（Express → 纯 API）

### 1.1 修改 `src/app.js`
- 删除 EJS view engine 配置（L84-86）
- 删除 4 个 page routes（L91-94），改为 SPA fallback：
  ```js
  // 生产环境：serve Vite build output
  app.use(express.static(path.join(__dirname, '../dist/client')))
  // SPA fallback: 所有非 API 路由返回 index.html
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.sendFile(path.join(__dirname, '../dist/client/index.html'))
    }
  })
  ```
- 保留所有 `/api/*` 路由不变
- `/session/:id/export` 保留（文件下载，不是页面）
- `/session/import` 保留（POST 上传）
- `/session/:id/share` 改为 API 端点返回 JSON
- insight 路由保留不变

### 1.2 修改 sessionController
- `getHomepage` → 删除（前端直接调 `/api/sessions`）
- `getSessionDetail` → 删除（前端调 `/api/sessions/:id/events`）
- `getTimeAnalysis` → 删除（前端调 `/api/sessions/:id/timeline`）
- `exportSession` → 保留
- `loadMoreSessions` → 保留
- `getSessions` → 保留
- `getSessionEvents` → 保留
- `getTimeline` → 保留

### 1.3 检查 page controller 是否有服务端数据注入
当前 EJS 模板通过 `window.__PAGE_DATA` 注入数据。需要确认哪些数据是在 controller 中 render 时传入的，确保前端能通过 API 获取同等数据。如果有 API 缺失的数据，新增对应 API 端点。

需要检查的数据点：
- Homepage: sessions 列表、source 过滤、分页
- Session Detail: session metadata、events
- Time Analyze: timeline 数据

---

## Phase 2: 共享组件（common/）

### 2.1 `AppHeader.vue`
- 来源: `index.ejs` L508-510, `time-analyze.ejs` L761-768
- 内容: 标题、返回按钮、WIP badge
- Props: `title`, `backLink`, `showWipBadge`

### 2.2 `LoadingSpinner.vue`
- 通用加载指示器
- Props: `text`

### 2.3 `MarkdownRenderer.vue`
- 来源: session-detail.js `ContentRenderer` 逻辑
- 封装 marked + DOMPurify
- Props: `content`, `searchQuery`（高亮）

### 2.4 `EventMarker.vue`
- 来源: time-analyze.js L1666-1692（重复两次）
- Props: `type`, `tooltip`
- 去重复用

---

## Phase 3: Homepage（HomeView）

### 3.1 `HomeView.vue`（页面壳）
- 来源: `index.ejs` + `homepage.js`
- 组合所有 home 组件，管理路由

### 3.2 `SessionSearchBar.vue`
- 来源: `index.ejs` L512-524, `homepage.js` L136-145
- 功能: 按 ID 搜索 session，回车跳转
- 用 `router.push` 替代 `window.location`

### 3.3 `SourceFilterPills.vue`
- 来源: `index.ejs` L535-542, `homepage.js` L477-506
- 功能: Copilot CLI / Chat / Claude / Modernize / Pi 过滤
- 状态持久化到 localStorage
- Emit: `@filter-change`

### 3.4 `SessionImport.vue`
- 来源: `index.ejs` L543-550, `homepage.js` L147-211
- 功能: ZIP 文件上传导入
- 调用 `POST /session/import`

### 3.5 `SessionList.vue`
- 来源: `homepage.js` L85-134
- 功能: 按日期分组、无限滚动加载
- 调用 `GET /api/sessions/load-more`
- 包含 `IntersectionObserver` 替代 scroll 事件

### 3.6 `SessionCard.vue`
- 来源: `homepage.js` L265-375
- Props: `session`
- 内容: source badge, WIP badge, summary, workspace, duration, event count, tags
- 点击跳转 `router.push('/session/:id')`

### 3.7 `SummaryPreview.vue`
- 来源: `index.ejs` L689-824（tooltip + bottom sheet 合并）
- Desktop: hover tooltip（定位跟随鼠标）
- Mobile: long-press bottom sheet
- Props: `summary`, `visible`, `position`

---

## Phase 4: Session Detail（SessionView）

### 4.1 `SessionView.vue`（页面壳）
- 来源: `session-vue.ejs` + `session-detail.js`
- 从 `useRoute().params.id` 获取 session ID
- 调用 `GET /api/sessions/:id/events` 获取数据
- 组合所有 session 组件

### 4.2 `SessionHeader.vue`
- 来源: session-detail.js template L1674-1685
- Props: `sessionId`, `title`, `isWip`
- 功能: 返回按钮、标题、Analysis 链接、Share/Export

### 4.3 `SidebarContainer.vue`
- 来源: template L1694-1935
- 功能: 可折叠侧边栏，mobile overlay
- Slot: 包含 InfoPanel, UsagePanel, ToolCallingSummary, SessionTags

### 4.4 `SessionInfoPanel.vue`
- 来源: template L1695-1752
- Props: `session`（source, version, model, agent, repo, branch, dates）

### 4.5 `UsagePanel.vue`
- 来源: template L1755-1868, logic L1314-1393
- Props: `events`
- 计算: total tokens, requests, per-model breakdown, cache metrics
- 复用 `usage-utils.js` → `composables/useUsageUtils.ts`

### 4.6 `ToolCallingSummary.vue`
- 来源: template L1871-1880, logic L1373-1386
- Props: `events`
- 水平柱状图

### 4.7 `SessionTags.vue`
- 来源: template L1883-1934, logic L1302-1573
- 功能: 标签显示、内联编辑、自动补全
- 调用 `GET /api/tags`, `GET/PUT /api/sessions/:id/tags`

### 4.8 `FilterToolbar.vue`
- 来源: template L1938-2078, logic L78-106
- 功能: 搜索框 + 结果计数 + 活跃过滤 chips + clear all
- Emit: `@filter-change`
- 包含 SubagentDropdown 和 EventTypeDropdown slot

### 4.9 `SubagentDropdown.vue`
- 来源: template L1983-2032, logic L377-428
- 功能: 可搜索的 agent 列表，颜色标识，meta tags
- Props: `agents`, `modelValue`

### 4.10 `EventTypeDropdown.vue`
- 来源: template L2037-2059, logic L264-290
- Props: `eventTypes`, `modelValue`

### 4.11 `VirtualEventList.vue`
- 来源: template L2095-2399, logic L148-237
- 使用 `vue-virtual-scroller`（npm 包）
- Props: `events`, `filters`

### 4.12 `TurnDivider.vue`
- 来源: template L2112-2129, logic L998-1013
- Props: `turnNumber`, `userReqNumber`, `time`, `duration`

### 4.13 `SubagentDivider.vue`
- 来源: template L2132-2149, logic L826-890
- Props: `agent`, `status`, `color`

### 4.14 `EventCard.vue`
- 来源: template L2152-2396, logic L636-784
- Props: `event`
- 条件渲染 10+ 事件类型（abort, session.start, model_change 等）

### 4.15 `ToolCallList.vue`
- 来源: template L2346-2392, logic L551-569 + L681-824
- Props: `toolCalls`
- 可展开的工具调用树：状态图标、耗时、命令预览、args/result/error

### 4.16 `ScrollControls.vue`
- 来源: template L2405-2408, logic L951-970
- 浮动的 scroll-to-top/bottom 按钮

---

## Phase 5: Time Analyze（TimeAnalyzeView）

### 5.1 `TimeAnalyzeView.vue`（页面壳）
- 来源: `time-analyze.ejs` + `time-analyze.js`
- 调用 `GET /api/sessions/:id/timeline`
- 组合所有 timeline 组件

### 5.2 `SummaryCards.vue`
- 来源: template L1497-1544
- 6 列统计: Duration, User Requests, Tool Calls, Sub-Agents, Time Breakdown, Token Usage
- Props: `stats`

### 5.3 `TabBar.vue`
- 来源: template L1547-1554
- Props: `tabs`, `modelValue`

### 5.4 `GanttTimeline.vue`
- 来源: template L1557-1751, logic（多个 composable）
- 最复杂的组件：crosshair、user-req rows、subagent rows、main-agent gap rows、event markers、time axis
- Props: `timelineItems`, `sessionStart`, `sessionEnd`

### 5.5 `EventMarkerLegend.vue`
- 来源: template L1577-1608
- 可折叠的图例面板

### 5.6 `ToolSummaryGrid.vue`
- 来源: template L1753-1774
- Props: `toolAnalysis`
- 工具分类卡片 + 柱状图

### 5.7 `InsightPanel.vue`
- 来源: template L1787-1977（4 种状态合并）
- 状态: generating / timeout / not-started / completed
- 调用 insight API（POST/GET/DELETE）
- Props: `sessionId`

### 5.8 Composables（从 time-analyze.js 提取）
```
composables/
  useSessionTimeline.js    # L234-269: sessionStart, sessionEnd, totalDuration
  useSubagentAnalysis.js   # L272-481: subagent 分析
  useEventMarkers.js       # L484-600: marker clustering
  useTurnAnalysis.js       # L698-791: turn 分析
  useToolAnalysis.js       # L793-951: tool 统计
  useGapAnalysis.js        # L1012-1116: gap 检测
  useTimeBreakdown.js      # L1129-1174: 时间分解
  useUnifiedTimeline.js    # L1186-1287: 统一 timeline
  useInsight.js            # L1351-1457: insight 轮询
  useFormatters.js         # L199-231: 格式化工具
  useGanttCrosshair.js     # L59-89: crosshair 鼠标追踪
  useMermaidExport.js      # L91-179: Mermaid 导出
```

---

## Phase 6: Tailwind CSS 迁移

### 6.1 提取内联样式
- `index.ejs`: ~600 行 CSS → Tailwind utility classes
- `session-vue.ejs`: ~1,690 行 CSS → Tailwind utility classes + 组件 `<style scoped>`
- `time-analyze.ejs`: ~750 行 CSS → Tailwind utility classes

### 6.2 策略
- 通用 reset/layout → Tailwind base
- 组件特定样式 → `<style scoped>` 或 Tailwind class
- 动态样式（如 subagent 颜色）→ CSS variables + Tailwind arbitrary values
- 深色主题 → 当前已是深色，保持不变

---

## Phase 7: 构建与发布

### 7.1 更新 esbuild → Vite
- 删除 `scripts/build.mjs`
- 后端仍用 esbuild 打包 `server.js` → `dist/server.min.js`（或改为直接发布源码）
- 前端 Vite build → `dist/client/`

### 7.2 更新 `package.json` files 字段
```json
"files": [
  "bin/",
  "dist/",
  "src/",
  "public/img/",
  "LICENSE",
  "README.md"
]
```

### 7.3 更新 `.npmignore`
移除 EJS/frontend 相关条目，增加 `src/client/`（源码不发布，只发布 dist）

### 7.4 更新 CI workflow
- `npm-publish.yml`: `npm run build:prod` 现在调用 Vite
- 验证 tarball 步骤更新（不再检查 `public/js/*.min.js`，改检查 `dist/client/`）

### 7.5 更新 AGENTS.md
反映新的项目结构

---

## Phase 8: 测试

### 8.1 Unit Tests（Jest）
- 现有后端测试应不受影响
- 前端 composables 可单独测试

### 8.2 E2E Tests（Playwright）
- 更新所有 E2E 测试适配 SPA 路由
- 等待 SPA hydration 而非服务端渲染

### 8.3 Smoke Test
- `npm run build:prod` 成功
- `npm start` → 访问 `/` 加载 SPA
- 3 个页面路由正常
- API 调用正常
- 无限滚动正常
- session detail 虚拟滚动正常
- time analyze 甘特图正常

---

## Phase 9: 清理

### 9.1 删除文件
- `views/` 目录（4 个 EJS 文件）
- `src/frontend/` 目录（6 个 JS 文件）
- `public/vendor/` 目录（CDN 文件）
- `scripts/build.mjs`
- `public/js/` 目录（esbuild 产物）

### 9.2 移除依赖
- `ejs`
- `esbuild`

---

## 执行顺序建议

推荐按 Phase 顺序执行，但可以并行的部分：
1. **Phase 0 + 1**（脚手架 + 后端）→ 先让 API 可用
2. **Phase 2**（共享组件）→ 为 3/4/5 做准备
3. **Phase 3 → 4 → 5**（三个页面，按复杂度递增）
4. **Phase 6**（Tailwind）→ 可以在每个页面迁移时同步做
5. **Phase 7 + 8 + 9**（收尾）

## 风险与注意事项

1. **`window.__PAGE_DATA`**: 需确认所有服务端注入的数据都能通过 API 获取，可能需要新增 1-2 个 API 端点
2. **vue-virtual-scroller**: CDN 版 vs npm 包 API 可能有差异，需要验证
3. **session-detail.js 巨大**（2,431 行）：拆分为 16 个组件 + composables 是最大工作量
4. **CSS 迁移到 Tailwind**: ~3,000 行内联 CSS，工作量不小但机械性强
5. **telemetry-browser.js**: 需要决定如何在 SPA 中集成（router afterEach hook？）
6. **SEO**: 不影响（本地工具，不需要 SSR）
7. **后端 server bundle**: 决定是否保留 esbuild 打包 server，还是直接发布 Node.js 源码

## 工作量估算

| Phase | 估算 |
|-------|------|
| Phase 0: 脚手架 | 1h |
| Phase 1: 后端改造 | 1h |
| Phase 2: 共享组件 | 2h |
| Phase 3: Homepage | 3h |
| Phase 4: Session Detail | 6h |
| Phase 5: Time Analyze | 4h |
| Phase 6: Tailwind CSS | 4h |
| Phase 7: 构建发布 | 2h |
| Phase 8: 测试 | 2h |
| Phase 9: 清理 | 0.5h |
| **总计** | **~25h** |
