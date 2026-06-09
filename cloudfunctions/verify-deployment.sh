#!/bin/bash

# 部署验证脚本
# 验证 getAssessment 和 submitAnswer 云函数是否正确部署

echo "========================================="
echo "提分神器小程序 - 云函数部署验证"
echo "========================================="
echo ""

# 检查 CloudBase CLI
if ! command -v tcb &> /dev/null; then
    echo "❌ CloudBase CLI 未安装"
    echo "请运行: npm install -g @cloudbase/cli"
    exit 1
fi

echo "✅ CloudBase CLI 已安装"
echo ""

# 检查登录状态
echo "检查登录状态..."
tcb login --loginType qq 2>/dev/null || true

# 获取云函数列表
echo "获取云函数列表..."
FUNCTIONS=$(tcb functions list 2>/dev/null)

if [ $? -ne 0 ]; then
    echo "❌ 获取云函数列表失败"
    exit 1
fi

echo "✅ 云函数列表获取成功"
echo ""

# 检查 getAssessment
echo "检查 getAssessment 云函数..."
if echo "$FUNCTIONS" | grep -q "getAssessment"; then
    echo "✅ getAssessment 已部署"

    # 获取详细信息
    echo "获取详细信息..."
    tcb fn detail getAssessment
else
    echo "❌ getAssessment 未部署"
    echo "请运行: tcb fn deploy getAssessment --dir cloudfunctions/getAssessment"
fi

echo ""

# 检查 submitAnswer
echo "检查 submitAnswer 云函数..."
if echo "$FUNCTIONS" | grep -q "submitAnswer"; then
    echo "✅ submitAnswer 已部署"

    # 获取详细信息
    echo "获取详细信息..."
    tcb fn detail submitAnswer
else
    echo "❌ submitAnswer 未部署"
    echo "请运行: tcb fn deploy submitAnswer --dir cloudfunctions/submitAnswer"
fi

echo ""
echo "========================================="
echo "部署验证完成"
echo "========================================="
echo ""
echo "下一步："
echo "1. 在微信开发者工具中打开小程序"
echo "2. 清除缓存并重新编译"
echo "3. 完成一次测评"
echo "4. 查看云函数日志验证修复效果"
