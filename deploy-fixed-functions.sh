#!/bin/bash
# 部署修复后的云函数

set -e

ENV_ID="cloud1-7gg9y9tjb2b867b6"

echo "🔧 部署修复后的云函数..."
echo "环境ID: $ENV_ID"

# 部署 pointsManager（增强错误日志）
echo "📦 部署 pointsManager..."
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  cloud functions deploy \
  --env $ENV_ID \
  --paths cloudfunctions/pointsManager

# 部署 practice_v2（优化：移除云函数间调用 + 批量查重）
echo "📦 部署 practice_v2..."
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  cloud functions deploy \
  --env $ENV_ID \
  --paths cloudfunctions/practice_v2

# 部署 configPermissions（检查数据库权限）
echo "📦 部署 configPermissions..."
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  cloud functions deploy \
  --env $ENV_ID \
  --paths cloudfunctions/configPermissions

# 部署 initDatabase（检查/创建集合）
echo "📦 部署 initDatabase..."
/Applications/wechatwebdevtools.app/Contents/MacOS/cli \
  cloud functions deploy \
  --env $ENV_ID \
  --paths cloudfunctions/initDatabase

echo "✅ 部署完成！"
echo ""
echo "📋 修复内容："
echo "1. practice_v2: 移除云函数间调用，改为直接数据库查询"
echo "2. practice_v2: 优化查重逻辑，从串行改为批量查询"
echo "3. pointsManager: 增强错误日志，明确错误类型"
echo "4. 新增 initDatabase/check-collections.js: 检查/创建数据库集合"
echo ""
echo "🔍 下一步："
echo "1. 在微信开发者工具中测试 pointsManager 是否正常"
echo "2. 在微信开发者工具中测试 practice_v2 是否在15秒内完成"
echo "3. 如仍有问题，调用 configPermissions 检查数据库权限"
