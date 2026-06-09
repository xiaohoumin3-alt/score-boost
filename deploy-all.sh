#!/bin/bash
set -e

PROJECT_PATH="/Users/seanxx/score-boost-mini"
WECHAT_CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
ENV_ID="cloud1-7gg9y9tjb2b867b6"

# 需要部署的云函数（新增+修改的）
FUNCTIONS=(
  "analytics"
  "pointsManager"
  "practice_v2"
  "generateAiQuestion"
)

echo "========================================="
echo "  日日守护 — 云函数部署"
echo "  环境: $ENV_ID"
echo "========================================="
echo ""

# 打开项目
echo "[1/3] 打开项目..."
$WECHAT_CLI open --project "$PROJECT_PATH"
sleep 5

# 检查登录
echo "[2/3] 检查登录状态..."
LOGIN=$($WECHAT_CLI islogin 2>&1)
echo "  $LOGIN"
echo ""

# 部署云函数
echo "[3/3] 部署云函数..."
echo ""

SUCCESS=0
FAIL=0

for func in "${FUNCTIONS[@]}"; do
  echo -n "  部署 $func... "
  
  OUTPUT=$($WECHAT_CLI cloud functions deploy \
    --env "$ENV_ID" \
    --names "$func" \
    --project "$PROJECT_PATH" \
    --remote-npm-install \
    2>&1)
  
  if echo "$OUTPUT" | grep -qi "success"; then
    echo "✓"
    ((SUCCESS++))
  else
    echo "✗"
    echo "    $OUTPUT"
    ((FAIL++))
  fi
done

echo ""
echo "========================================="
echo "  完成: 成功 $SUCCESS / 失败 $FAIL"
echo "========================================="

if [ $FAIL -gt 0 ]; then
  echo ""
  echo "失败的可手动部署:"
  echo "  微信开发者工具 → 云开发 → 云函数 → 右键 → 上传并部署"
fi

echo ""
echo "后续步骤:"
echo "  1. 在云数据库中创建集合: analytics, redeem_codes"
echo "  2. 创建测试兑换码:"
echo "     db.collection('redeem_codes').add({ data: { code: 'TEST100', points: 100, used: false } })"
