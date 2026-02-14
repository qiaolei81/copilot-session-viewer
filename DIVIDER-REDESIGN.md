# Divider 重新设计方案（修复 sidebar 遮挡问题）

## 当前问题
- Divider 延伸到左边，遮挡 sidebar
- Sidebar Accent 设计的 padding 和 margin 导致溢出

---

## 方案 1: 紧凑标签式 🌟 (推荐)

**设计理念：**
- 标签贴在内容区左侧
- 不使用 padding/margin，避免溢出
- 清晰但不抢眼

```css
.turn-divider {
  display: flex;
  align-items: center;
  padding: 0;
  margin: 12px 0 12px 12px;  /* 左边距避免紧贴边缘 */
  background: transparent;
}

.turn-divider-text {
  background: #8250df;
  color: #ffffff;
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}

/* 右侧线条（可选） */
.turn-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #30363d;
  margin-left: 12px;
}
```

**优点：**
- ✅ 不会溢出到 sidebar
- ✅ 清晰的视觉分隔
- ✅ 紧凑，不占用过多垂直空间
- ✅ 标签样式现代、专业

---

## 方案 2: 顶部横线式

**设计理念：**
- 纯横线 + 小文字
- 极简风格
- 类似 Discord 日期分隔线

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  margin: 0;
  background: transparent;
}

.turn-divider::before {
  content: '';
  flex: 1;
  height: 1px;
  background: #30363d;
}

.turn-divider-text {
  color: #8a8a8a;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  white-space: nowrap;
  padding: 2px 8px;
  background: #161b22;
  border-radius: 10px;
}

.turn-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #30363d;
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}
```

**优点：**
- ✅ 不会溢出
- ✅ 极简设计
- ✅ 水平居中对称
- ✅ 低视觉权重，不干扰内容

---

## 方案 3: 左侧图标式

**设计理念：**
- 左侧小图标 + 文字
- 无线条
- 最紧凑

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 8px 0;
  background: rgba(130, 80, 223, 0.05);
  border-left: 2px solid #8250df;
  border-radius: 0 4px 4px 0;
}

.turn-divider::before {
  content: '▶';
  color: #8250df;
  font-size: 10px;
}

.turn-divider-text {
  color: #8250df;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}
```

**优点：**
- ✅ 不会溢出
- ✅ 左对齐，视觉流畅
- ✅ 图标提供视觉锚点
- ✅ 淡背景不抢眼

---

## 方案对比

| 特性 | 方案 1 (紧凑标签) | 方案 2 (横线) | 方案 3 (图标) |
|------|------------------|--------------|--------------|
| 视觉权重 | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| 空间占用 | 小 | 中 | 小 |
| 现代感 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| 清晰度 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| 不遮挡 sidebar | ✅ | ✅ | ✅ |

---

## 推荐

**首选：方案 1 (紧凑标签式)**
- 现代、清晰、不溢出
- 视觉权重适中
- 类似 Linear / Notion 的标签设计

**备选：方案 2 (横线式)**
- 如果想要更低调的设计
- 适合内容密集的场景

---

## 立即应用方案 1？

如需测试其他方案或调整细节，请告知。
