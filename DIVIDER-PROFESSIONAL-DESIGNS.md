# Turn Divider - 专业设计方案 (5选1)

## 当前问题
- 紧凑标签式设计不够优雅
- 紫色标签太抢眼
- 需要更现代、专业的设计

---

## 方案 1: Minimal Line + Badge 🌟 (推荐)

**设计理念：极简主义，类似 Linear**
- 细线条分隔
- 小圆点 + 文字标签
- 低视觉权重，不抢眼

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0;
  margin: 8px 0 8px 12px;
  background: transparent;
}

.turn-divider::before {
  content: '';
  width: 4px;
  height: 4px;
  background: #6e7681;
  border-radius: 50%;
  flex-shrink: 0;
}

.turn-divider-text {
  color: #7d8590;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  white-space: nowrap;
  margin: 0;
}

.turn-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, #30363d, transparent);
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}

.divider-separator {
  width: 100%;
  height: 1px;
  background: transparent;
  margin-top: 2px;
}
```

**特点：**
- ✅ 极简、优雅
- ✅ 不打断视觉流
- ✅ 灰色调，低调
- ✅ 类似 Linear / Notion 风格

---

## 方案 2: GitHub Timeline Style

**设计理念：类似 GitHub PR timeline**
- 左侧竖线 + 圆点
- 文字右侧对齐
- 清晰的时间线感

```css
.turn-divider {
  position: relative;
  padding: 0 0 0 24px;
  margin: 8px 0 8px 12px;
  background: transparent;
}

.turn-divider::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 8px;
  background: #8250df;
  border: 2px solid #0d1117;
  border-radius: 50%;
  z-index: 2;
}

.turn-divider::after {
  content: '';
  position: absolute;
  left: 7px;
  top: 50%;
  width: 1px;
  height: 100%;
  background: #30363d;
  transform: translateY(-50%);
  z-index: 1;
}

.turn-divider-text {
  display: inline-block;
  color: #c9d1d9;
  font-size: 12px;
  font-weight: 600;
  background: #161b22;
  padding: 4px 8px;
  border-radius: 4px;
  border: 1px solid #30363d;
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}

.divider-separator {
  display: none;
}
```

**特点：**
- ✅ 时间线风格
- ✅ 清晰的视觉层次
- ✅ 熟悉的 GitHub 风格

---

## 方案 3: VS Code Section Header

**设计理念：类似 VS Code 侧边栏分组**
- 折叠箭头（装饰性）
- 大写标签
- 淡背景色

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  margin: 8px 0 8px 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 4px;
}

.turn-divider::before {
  content: '▼';
  color: #6e7681;
  font-size: 8px;
  opacity: 0.6;
}

.turn-divider-text {
  color: #8b949e;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin: 0;
}

.turn-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #30363d;
  margin-left: 8px;
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}

.divider-separator {
  width: 100%;
  height: 1px;
  background: transparent;
  margin-top: 2px;
}
```

**特点：**
- ✅ 清晰的分组感
- ✅ 淡背景不抢眼
- ✅ 类似 VS Code 风格

---

## 方案 4: Slack Message Divider

**设计理念：类似 Slack 日期分隔线**
- 居中文字
- 两侧等长线条
- 极简对称

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0;
  margin: 12px 12px;
  background: transparent;
}

.turn-divider::before,
.turn-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #30363d;
}

.turn-divider-text {
  color: #7d8590;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  white-space: nowrap;
  padding: 2px 8px;
  background: #0d1117;
  border-radius: 10px;
  border: 1px solid #21262d;
  margin: 0;
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}

.divider-separator {
  display: none;
}
```

**特点：**
- ✅ 对称美感
- ✅ 居中设计
- ✅ 类似 Slack 风格

---

## 方案 5: Notion Callout Style

**设计理念：类似 Notion callout 块**
- 左侧色条
- 淡背景
- 图标 + 文字

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  margin: 8px 0 8px 12px;
  background: rgba(88, 166, 255, 0.05);
  border-left: 3px solid #58a6ff;
  border-radius: 0 4px 4px 0;
}

.turn-divider::before {
  content: '→';
  color: #58a6ff;
  font-size: 12px;
  font-weight: bold;
}

.turn-divider-text {
  color: #c9d1d9;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin: 0;
}

.turn-divider::after {
  content: none;
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}

.divider-separator {
  width: 100%;
  height: 1px;
  background: transparent;
  margin-top: 2px;
}
```

**特点：**
- ✅ 温和的背景色
- ✅ 清晰的左侧色条
- ✅ 类似 Notion 风格

---

## 方案对比

| 特性 | 方案1 (Minimal) | 方案2 (Timeline) | 方案3 (VS Code) | 方案4 (Slack) | 方案5 (Notion) |
|------|----------------|-----------------|----------------|--------------|---------------|
| 视觉权重 | ⭐ 最低 | ⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| 现代感 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 专业度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 清晰度 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 优雅度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |

---

## 推荐

**首选：方案 1 (Minimal Line + Badge)**
- 最现代、最优雅
- 不打断阅读流
- 类似 Linear / Notion

**备选：方案 4 (Slack 风格)**
- 极简对称
- 视觉舒适

**如果需要更强的分隔感：方案 2 (Timeline)**
- 时间线风格清晰
- GitHub 用户熟悉

---

## 立即应用？

回复数字 (1-5) 选择方案，我立即实施。

或者告诉我调整方向：
- 更灰色 / 更彩色
- 更细 / 更粗
- 更居中 / 更靠左
