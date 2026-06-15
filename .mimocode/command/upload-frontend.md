---
description: Upload the WeChat Mini Program frontend code using miniprogram-ci for review/release
---

# Upload Frontend

Upload the mini program frontend code to WeChat for review/release.

## Usage

```
/upload-frontend [--version <version>] [--desc <description>]
```

## Parameters

- `--version` - (Optional) Version string (default: timestamp-based)
- `--desc` - (Optional) Upload description

## Prerequisites

- `miniprogram-ci` installed globally or in project
- Private key file at `/Users/seanxx/Downloads/private.wx1bdd9ea6620c4ae1.key`

## Procedure

### Step 1: Verify miniprogram-ci

```bash
command -v miniprogram-ci 2>/dev/null || npm list -g miniprogram-ci 2>/dev/null || echo "miniprogram-ci not installed"
```

### Step 2: Upload

```bash
cd /Users/seanxx/score-boost-mini

export WECHAT_UPLOAD_KEY="/Users/seanxx/Downloads/private.wx1bdd9ea6620c4ae1.key"
export NODE_PATH="/Users/seanxx/.npm-global/lib/node_modules"

cat > /tmp/deploy-frontend.js << 'EOF'
const miniprogramCi = require('miniprogram-ci');
const path = require('path');

const project = new miniprogramCi.Project({
  appid: 'wx1bdd9ea6620c4ae1',
  type: 'miniProgram',
  projectPath: '/Users/seanxx/score-boost-mini',
  privateKeyPath: process.env.WECHAT_UPLOAD_KEY,
  ignores: ['node_modules/**/*', '__tests__/**/*'],
});

(async () => {
  try {
    await miniprogramCi.upload({
      project,
      version: process.env.UPLOAD_VERSION || '1.0.0',
      desc: process.env.UPLOAD_DESC || 'Auto upload',
      setting: {
        es6: true,
        es7: true,
        minify: true,
        autoPrefixWXSS: true,
        minifyWXML: true,
      },
      onProgressUpdate: console.log,
    });
    console.log('Upload successful!');
  } catch (e) {
    console.error('Upload failed:', e);
    process.exit(1);
  }
})();
EOF

UPLOAD_VERSION="${1:-$(date +%Y%m%d%H%M)}"
UPLOAD_DESC="${2:-Auto upload}"
node /tmp/deploy-frontend.js
```

### Step 3: Report

Report: upload status, version, description.
