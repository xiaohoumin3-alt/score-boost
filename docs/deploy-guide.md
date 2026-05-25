# 反馈系统云函数部署指南

## 方式一：使用自动化脚本（推荐）

### 1. 获取上传密钥

1. 登录[微信小程序管理后台](https://mp.weixin.qq.com)
2. 进入: 开发 -> 开发设置 -> 小程序代码上传
3. 点击"生成密钥" -> 下载密钥文件
4. 将密钥文件保存到安全位置

### 2. 设置环境变量

```bash
export WECHAT_UPLOAD_KEY=/path/to/your/private.key
```

### 3. 执行部署

```bash
# 方式1: 使用shell脚本
./deploy.sh

# 方式2: 直接使用node
node deploy-cloud-functions.js
```

### 4. 验证部署

部署完成后，在微信开发者工具中:
1. 点击"云开发"按钮
2. 进入"云函数"标签
3. 确认以下云函数已部署:
   - submitFeedback
   - getMyFeedback
   - markAsRead
   - adminLogin
   - getFeedbackList
   - replyFeedback

---

## 方式二：使用开发者工具手动部署

1. 打开微信开发者工具
2. 右键点击每个云函数目录
3. 选择"上传并部署：云端安装依赖"
4. 等待部署完成

---

## 部署后操作

### 1. 创建数据库集合

参考 `docs/database-feedback-setup.md` 和 `docs/database-admin-setup.md`

### 2. 测试验证

参考 `docs/feedback-test-checklist.md`
