# ESLint Configuration

## Quick Start

```bash
# Check for issues
npm run lint

# Auto-fix issues
npm run lint:fix

# Strict mode (treat warnings as errors)
npm run lint:check
```

## What's Configured

### JavaScript Rules
- ✅ ES2022 syntax support
- ✅ Node.js and Browser globals
- ✅ Detect unused variables (warnings)
- ✅ Enforce `===` over `==`
- ✅ Prevent `eval()` usage
- ✅ Prefer `const` over `let/var`
- ⚠️ Semicolons (warnings only)
- ⚠️ Single quotes (warnings, auto-fixable)

### Vue 3 Rules
- ✅ Vue 3 recommended rules
- ✅ Allow single-word component names
- ✅ Allow `v-html` (needed for markdown)
- ⚠️ Prop validation warnings
- ⚠️ Unused vars warnings

### Test Files
- ✅ Jest globals recognized
- ✅ Relaxed rules for test files

## Files Ignored

- `node_modules/`
- `coverage/`
- Debug/test scripts (`check-*.js`, `test-*.js`, etc.)
- External libraries (`public/hyperlist.js`)

## Common Issues

### "Strings must use singlequote"
**Auto-fix:** `npm run lint:fix`

### "no-unused-vars"
Comment with `// eslint-disable-next-line no-unused-vars` if intentional, or:
- Rename to start with `_` (e.g., `_unusedVar`)
- Remove the unused variable

### Disable for a file
```js
/* eslint-disable */
// your code here
/* eslint-enable */
```

### Disable a specific rule
```js
/* eslint-disable no-unused-vars */
const unused = 'test';
/* eslint-enable no-unused-vars */
```

## Integration

### VS Code
Install: `ESLint` extension by Microsoft

Add to `.vscode/settings.json`:
```json
{
  "eslint.enable": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

### Pre-commit Hook
```bash
npm install --save-dev husky lint-staged
npx husky init
```

Add to `package.json`:
```json
{
  "lint-staged": {
    "*.{js,vue}": "eslint --fix"
  }
}
```

## Current Warnings (9)

Run `npm run lint` to see details. Most are unused variables that can be safely removed.
