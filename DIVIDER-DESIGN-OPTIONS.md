# Turn Divider Design Options

## Current Design
**Style:** Horizontal lines with centered text  
**Issues:** Too subtle, lacks visual impact

---

## Option 1: Pill Badge Style (Recommended) 🌟

**Inspiration:** Linear, Notion  
**Visual Weight:** Medium  
**Best for:** Clear sections without overwhelming content

```css
.turn-divider {
  display: flex;
  justify-content: center;
  margin: 16px 0;
  padding: 0;
  position: relative;
  background: transparent;
}
.turn-divider::before {
  content: '';
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(to right, transparent 0%, #30363d 20%, #30363d 80%, transparent 100%);
}
.turn-divider-text {
  background: linear-gradient(135deg, #8250df 0%, #9d6ce8 100%);
  color: #ffffff;
  padding: 6px 20px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  position: relative;
  z-index: 1;
  box-shadow: 0 2px 8px rgba(130, 80, 223, 0.3);
}
.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}
```

**Rationale:**
- Pill shape creates clear visual anchor
- Gradient background adds depth
- Shadow provides subtle elevation
- Centered design draws attention naturally

---

## Option 2: Sidebar Accent Style

**Inspiration:** VS Code, GitHub Notifications  
**Visual Weight:** High  
**Best for:** Strong section separation

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
  padding: 12px 16px;
  background: linear-gradient(90deg, rgba(130, 80, 223, 0.08) 0%, transparent 100%);
  border-left: 4px solid #8250df;
  border-radius: 0 6px 6px 0;
}
.turn-divider-text {
  color: #8250df;
  font-size: 13px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin: 0;
  padding: 0;
}
.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}
.turn-divider::after {
  content: '▶';
  color: #8250df;
  font-size: 10px;
  margin-left: auto;
  opacity: 0.6;
}
```

**Rationale:**
- Sidebar accent creates strong left-to-right flow
- Background gradient adds dimension without overwhelming
- Arrow icon reinforces forward progress
- Padding provides breathing room

---

## Option 3: Minimalist Timeline Style

**Inspiration:** Slack, Discord  
**Visual Weight:** Low  
**Best for:** Maximum content focus

```css
.turn-divider {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: center;
  margin: 12px 0;
  padding: 8px 0;
  background: transparent;
}
.turn-divider::before {
  content: '';
  width: 8px;
  height: 8px;
  background: #8250df;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(130, 80, 223, 0.2);
  position: relative;
  left: -4px;
}
.turn-divider-text {
  color: #8a8a8a;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 0;
}
.turn-divider-line-left {
  display: none;
}
.turn-divider-line-right {
  width: 100%;
  height: 1px;
  background: #30363d;
  opacity: 0.5;
}
```

**Rationale:**
- Timeline dot creates navigation metaphor
- Subtle colors keep focus on events
- Minimal visual disruption
- Grid layout ensures consistent alignment

---

## Option 4: Card Header Style

**Inspiration:** Figma, Framer  
**Visual Weight:** Medium-High  
**Best for:** Rich metadata display

```css
.turn-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 16px 0 12px 0;
  padding: 10px 16px;
  background: #161b22;
  border: 1px solid #30363d;
  border-left: 3px solid #8250df;
  border-radius: 6px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
}
.turn-divider-text {
  color: #c9d1d9;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
  margin: 0;
  padding: 0;
}
.turn-divider-text::before {
  content: '🔄 ';
  opacity: 0.8;
}
.turn-divider-line-left,
.turn-divider-line-right {
  display: none;
}
.turn-divider::after {
  content: attr(data-timestamp);
  color: #8a8a8a;
  font-size: 11px;
  margin-left: auto;
  font-weight: 400;
}
```

**Rationale:**
- Card style creates contained section
- Border + shadow provides depth
- Icon adds personality
- Space for metadata (timestamp, etc.)

---

## Comparison Matrix

| Option | Visual Weight | Space Efficiency | Clarity | Modern Feel | Flexibility |
|--------|---------------|------------------|---------|-------------|-------------|
| **1. Pill Badge** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **2. Sidebar Accent** | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **3. Timeline** | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **4. Card Header** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## Recommendation

**Primary: Option 1 (Pill Badge)** 🌟  
- Best balance of clarity and subtlety
- Modern, professional appearance
- Won't compete with event content
- Easy to scan visually

**Alternative: Option 2 (Sidebar Accent)**  
- If you want stronger visual hierarchy
- Good for sessions with many turns
- Works well with left-to-right reading flow

**Budget Option: Option 3 (Timeline)**  
- Minimal visual disruption
- Best for dense content
- Familiar timeline metaphor
