#!/bin/bash

# 反馈系统全自动部署脚本
# 使用微信开发者工具CLI进行云函数部署

set -e

PROJECT_PATH="/Users/seanxx/score-boost-mini"
WECHAT_CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
ENV_ID="cloud1-7gg9y9tjb2b867b6"

# 云函数列表
FUNCTIONS=(
  "submitFeedback"
  "getMyFeedback"
  "markAsRead"
  "adminLogin"
  "getFeedbackList"
  "replyFeedback"
)

echo "========================================="
echo "  反馈系统云函数全自动部署"
echo "========================================="
echo ""

# 1. 打开项目
echo "[1/4] 打开项目..."
$WECHAT_CLI open --project "$PROJECT_PATH" > /dev/null 2>&1 &
sleep 3
echo "  ✓ 项目已打开"
echo ""

# 2. 检查登录状态
echo "[2/4] 检查登录状态..."
LOGIN_STATUS=$($WECHAT_CLI islogin --project "$PROJECT_PATH" 2>&1 | grep -o '"login":[^,]*' | cut -d: -f2)

if [ "$LOGIN_STATUS" != "true" ]; then
  echo "  ⚠ 需要登录微信开发者工具"
  echo "  请在弹出的窗口中扫码登录"
  $WECHAT_CLI login --project "$PROJECT_PATH" > /dev/null 2>&1

  # 等待登录完成（最多60秒）
  for i in {1..60}; do
    sleep 1
    LOGIN_STATUS=$($WECHAT_CLI islogin --project "$PROJECT_PATH" 2>&1 | grep -o '"login":[^,]*' | cut -d: -f2)
    if [ "$LOGIN_STATUS" = "true" ]; then
      echo "  ✓ 登录成功"
      break
    fi
    if [ $i -eq 60 ]; then
      echo "  ✗ 登录超时，请手动登录后重试"
      exit 1
    fi
  done
else
  echo "  ✓ 已登录"
fi
echo ""

# 3. 列出云环境
echo "[3/4] 检查云环境..."
$WECHAT_CLI cloud env list --project "$PROJECT_PATH" 2>&1 | grep -q "$ENV_ID" && echo "  ✓ 云环境 $ENV_ID 存在" || echo "  ⚠ 云环境可能不存在"
echo ""

# 4. 部署云函数
echo "[4/4] 部署云函数..."
echo ""

SUCCESS_COUNT=0
FAIL_COUNT=0
FAILED_FUNCTIONS=()

for func in "${FUNCTIONS[@]}"; do
  echo -n "  部署 $func... "

  OUTPUT=$($WECHAT_CLI cloud functions deploy \
    --env "$ENV_ID" \
    --names "$func" \
    --project "$PROJECT_PATH" \
    --remote-npm-install \
    2>&1)

  if echo "$OUTPUT" | grep -q '"success":true'; then
    echo "✓"
    ((SUCCESS_COUNT++))
  else
    echo "✗"
    ((FAIL_COUNT++))
    FAILED_FUNCTIONS+=("$func")
    echo "    错误: $(echo "$OUTPUT" | grep -o 'errmsg":"[^"]*' | cut -d: -f2)"
  fi
done

echo ""
echo "========================================="
echo "  部署完成"
echo "========================================="
echo ""
echo "成功: $SUCCESS_COUNT/${#FUNCTIONS[@]}"
echo "失败: $FAIL_COUNT/${#FUNCTIONS[@]}"

if [ $FAIL_COUNT -gt 0 ]; then
  echo ""
  echo "失败的云函数:"
  for func in "${FAILED_FUNCTIONS[@]}"; do
    echo "  - $func"
  done
  echo ""
  echo "建议: 请在微信开发者工具中手动部署失败的云函数"
  echo "  右键云函数目录 -> 上传并部署：云端安装依赖"
fi

echo ""
echo "后续步骤:"
echo "  1. 在云开发控制台创建数据库集合"
echo "  2. 参考 docs/database-feedback-setup.md"
echo "  3. 参考 docs/database-admin-setup.md"
