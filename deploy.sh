#!/bin/bash

# 反馈系统云函数自动化部署脚本

echo "========================================="
echo "  反馈系统云函数自动化部署"
echo "========================================="
echo ""

# 检查环境变量
if [ -z "$WECHAT_UPLOAD_KEY" ]; then
  echo "错误: 请设置环境变量 WECHAT_UPLOAD_KEY"
  echo ""
  echo "设置方式:"
  echo "  export WECHAT_UPLOAD_KEY=/path/to/private.key"
  echo ""
  echo "获取密钥:"
  echo "  微信小程序管理后台 -> 开发 -> 开发设置"
  echo "  -> 小程序代码上传 -> 生成密钥 -> 下载"
  echo ""
  exit 1
fi

# 检查密钥文件是否存在
if [ ! -f "$WECHAT_UPLOAD_KEY" ]; then
  echo "错误: 密钥文件不存在: $WECHAT_UPLOAD_KEY"
  exit 1
fi

# 设置可选的 APPID
if [ -n "$1" ]; then
  export WECHAT_APPID="$1"
fi

# 执行部署
node deploy-cloud-functions.js
