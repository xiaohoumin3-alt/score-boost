#!/bin/bash
# questionGenerator 云函数部署脚本
# 用于快速验证 0%正确率修复

echo "========================================="
echo "部署 questionGenerator 云函数"
echo "========================================="
echo ""

# 微信开发者工具路径
WECHAT_CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"

# 云环境ID
CLOUD_ENV="cloud1-7gg9y9tjb2b867b6"

# 项目路径（绝对路径）
PROJECT_PATH="/Users/seanxx/score-boost-mini"

echo "检查微信开发者工具..."
if [ ! -f "$WECHAT_CLI" ]; then
  echo "❌ 微信开发者工具未找到: $WECHAT_CLI"
  echo "请确认安装路径或手动部署"
  exit 1
fi

echo "✅ 微信开发者工具找到"
echo ""

echo "项目路径: $PROJECT_PATH"
echo "云环境ID: $CLOUD_ENV"
echo ""

echo "开始部署..."
echo "----------------------------------------"

# 进入项目目录执行部署
cd "$PROJECT_PATH" || exit 1

# 使用正确格式的部署命令
$WECHAT_CLI upload \
  --project "$PROJECT_PATH" \
  --env "$CLOUD_ENV" \
  --path "cloudfunctions/questionGenerator"

DEPLOY_RESULT=$?

echo ""
echo "----------------------------------------"
if [ $DEPLOY_RESULT -eq 0 ]; then
  echo "✅ 部署成功！"
  echo ""
  echo "下一步："
  echo "1. 打开微信开发者工具"
  echo "2. 点击'云开发' → '云函数'"
  echo "3. 确认 questionGenerator 状态为'正常'"
  echo "4. 清除缓存重新编译小程序"
  echo "5. 发起新测评并提交"
  echo "6. 查看结果页面的正确率"
else
  echo "❌ 部署失败，错误代码: $DEPLOY_RESULT"
  echo "请检查错误信息并重试"
  exit 1
fi

echo ""
echo "========================================="
echo "部署完成"
echo "========================================="
