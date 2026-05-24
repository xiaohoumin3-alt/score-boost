#!/bin/bash

# 反馈系统云函数自动部署（带登录监控）

set -e

PROJECT_PATH="/Users/seanxx/score-boost-mini"
WECHAT_CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
ENV_ID="cloud1-7gg9y9tjb2b867b6"

FUNCTIONS=(
  "submitFeedback"
  "getMyFeedback"
  "markAsRead"
  "adminLogin"
  "getFeedbackList"
  "replyFeedback"
)

echo "========================================="
echo "  反馈系统云函数自动部署"
echo "========================================="
echo ""

# 打开项目
echo "打开项目..."
$WECHAT_CLI open --project "$PROJECT_PATH" > /dev/null 2>&1 &
OPEN_PID=$!

# 等待项目打开
sleep 3

# 检查并等待登录
echo "检查登录状态..."
while true; do
  LOGIN_RESULT=$($WECHAT_CLI islogin --project "$PROJECT_PATH" 2>&1)
  if echo "$LOGIN_RESULT" | grep -q '"login":true'; then
    echo "✓ 已登录"
    break
  fi
  echo "等待登录...（请在微信开发者工具中扫码登录）"
  $WECHAT_CLI login --project "$PROJECT_PATH" > /dev/null 2>&1 &
  sleep 5
done

echo ""
echo "开始部署云函数..."
echo ""

# 部署云函数
for func in "${FUNCTIONS[@]}"; do
  echo -n "[$(printf "%02d" $(( ${#FUNCTIONS[@]} - ${#FUNCTIONS[@]} + 1 )))/${#FUNCTIONS[@]}] $func ... "

  # 尝试部署，最多3次
  for attempt in {1..3}; do
    OUTPUT=$($WECHAT_CLI cloud functions deploy \
      --env "$ENV_ID" \
      --names "$func" \
      --project "$PROJECT_PATH" \
      --remote-npm-install \
      2>&1)

    if echo "$OUTPUT" | grep -q '"success":true'; then
      echo "✓"
      break
    elif echo "$OUTPUT" | grep -q '40013'; then
      if [ $attempt -lt 3 ]; then
        echo "重试($attempt/3)..."
        sleep 2
        continue
      else
        echo "✗ (API错误，请手动部署)"
        break
      fi
    else
      echo "✗"
      echo "  错误: $(echo "$OUTPUT" | tail -1)"
      break
    fi
  done
done

echo ""
echo "========================================="
echo "部署完成！"
echo "========================================="
echo ""
echo "如果部分云函数部署失败，请："
echo "1. 打开微信开发者工具"
echo "2. 右键云函数目录"
echo "3. 选择'上传并部署：云端安装依赖'"
