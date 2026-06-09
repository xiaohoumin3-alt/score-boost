#!/bin/bash
# 部署云函数：复制 shared + 修正路径 + 部署 + 恢复路径 + 清理
set -e

FN="$1"
SHARED_DIR="cloudfunctions/shared"
FN_DIR="cloudfunctions/$FN"

if [ -z "$FN" ]; then
  echo "Usage: $0 <function-name>"
  exit 1
fi

# 1. 复制 shared 到函数目录
mkdir -p "$FN_DIR/shared"
cp "$SHARED_DIR"/*.js "$FN_DIR/shared/" 2>/dev/null || true
if [ -d "$SHARED_DIR/llm-core" ]; then
  mkdir -p "$FN_DIR/shared/llm-core"
  cp "$SHARED_DIR/llm-core"/*.js "$FN_DIR/shared/llm-core/" 2>/dev/null || true
fi
echo "📦 $FN: shared 已复制"

# 2. 临时将 ../shared/ 替换为 ./shared/
find "$FN_DIR" -name '*.js' ! -path '*/node_modules/*' ! -path '*/__tests__/*' -exec sed -i '' "s|require('../shared/|require('./shared/|g" {} +
find "$FN_DIR" -name '*.js' ! -path '*/node_modules/*' ! -path '*/__tests__/*' -exec sed -i '' "s|require(\"../shared/|require(\"./shared/|g" {} +
# Also fix ../../shared/ for subdirectory files (like workflow/steps/)
find "$FN_DIR" -name '*.js' ! -path '*/node_modules/*' ! -path '*/__tests__/*' -exec sed -i '' "s|require('../../shared/|require('../shared/|g" {} +

# 3. 部署
echo "y" | tcb fn deploy "$FN" -e cloud1-7gg9y9tjb2b867b6 --dir "$FN_DIR" --force 2>&1 | grep -E "✔|✗|Error"

# 4. 恢复路径
git checkout -- "$FN_DIR" 2>/dev/null || true

# 5. 清理
rm -rf "$FN_DIR/shared"
echo "🧹 $FN: 已恢复+清理"
