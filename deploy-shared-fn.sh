#!/bin/bash
# 部署单个云函数，自动复制 shared/ 到函数目录
set -e

FN="$1"
SHARED_DIR="cloudfunctions/shared"
FN_DIR="cloudfunctions/$FN"

if [ -z "$FN" ]; then
  echo "Usage: $0 <function-name>"
  exit 1
fi

# 复制 shared 到函数目录
if [ ! -d "$FN_DIR/shared" ]; then
  mkdir -p "$FN_DIR/shared"
fi
cp "$SHARED_DIR"/*.js "$FN_DIR/shared/" 2>/dev/null || true
if [ -d "$SHARED_DIR/llm-core" ]; then
  mkdir -p "$FN_DIR/shared/llm-core"
  cp "$SHARED_DIR/llm-core"/*.js "$FN_DIR/shared/llm-core/" 2>/dev/null || true
fi

echo "📦 $FN: shared 已复制"

# 部署
echo "y" | tcb fn deploy "$FN" -e cloud1-7gg9y9tjb2b867b6 --dir "$FN_DIR" --force 2>&1 | grep -E "✔|✗|Error"

# 清理
rm -rf "$FN_DIR/shared"
echo "🧹 $FN: shared 已清理"
