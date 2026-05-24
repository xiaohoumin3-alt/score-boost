# 反馈系统部署状态

## 已完成 ✅

### 0. 云开发初始化
- ✅ app.js 添加 wx.cloud.init()

### 1. 云函数（6个）
- ✅ submitFeedback - 提交反馈
- ✅ getMyFeedback - 获取我的反馈
- ✅ markAsRead - 标记已读
- ✅ adminLogin - 管理员登录
- ✅ getFeedbackList - 获取反馈列表
- ✅ replyFeedback - 回复反馈

**云环境**: cloud1-7gg9y9tjb2b867b6

### 2. 静态网站托管
- ✅ 管理后台已部署
- ✅ 访问地址: https://cloud1-7gg9y9tjb2b867b6-1393681073.tcloudbaseapp.com/login.html

### 3. 小程序页面（3个）
- ✅ pages/feedback/feedback.wxml - 反馈表单页
- ✅ pages/feedback-list/feedback-list.wxml - 我的反馈列表
- ✅ pages/feedback-detail/feedback-detail.wxml - 反馈详情

### 4. 管理后台（3个HTML）
- ✅ admin/login.html - 登录页
- ✅ admin/index.html - 反馈列表
- ✅ admin/detail.html - 反馈详情

### 5. 入口配置
- ✅ home页添加反馈入口
- ✅ app.json页面注册

---

## 待完成 ⏳

### 1. 数据库集合（需手动创建）

参考: `docs/database-setup-guide.md`

**集合1: feedback**
- 权限: 仅创建者可读写
- 索引: openid, status, createdAt

**集合2: admin**
- 权限: 仅创建者可读写
- 索引: username (unique)
- 初始账号: admin / admin (密码Base64编码: YWRtaW4=)

### 2. 测试验证

1. **C端测试流程**:
   - 打开小程序 -> 点击反馈入口
   - 提交反馈（2-500字）
   - 查看我的反馈列表
   - 查看反馈详情

2. **B端测试流程**:
   - 访问管理后台URL
   - 登录 (admin/admin)
   - 查看反馈列表
   - 回复反馈

---

## 快速开始

### 创建数据库集合

1. 微信小程序管理后台 -> 开发 -> 云开发
2. 选择云环境 `cloud1-7gg9y9tjb2b867b6`
3. 数据库 -> 新建集合 -> `feedback`
4. 权限: 仅创建者可读写
5. 重复步骤创建 `admin` 集合
6. 在admin集合添加初始管理员账号

### 获取管理后台URL

云开发控制台 -> 静态网站托管 -> 查看域名

格式: `https://<env-id>.service.tcloudbase.com/admin/index.html`

---

## 部署命令汇总

```bash
# 查看云函数列表
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions list \
  --env cloud1-7gg9y9tjb2b867b6 \
  --project /Users/seanxx/score-boost-mini

# 部署单个云函数
/Applications/wechatwebdevtools.app/Contents/MacOS/cli cloud functions deploy \
  --env cloud1-7gg9y9tjb2b867b6 \
  --names submitFeedback \
  --project /Users/seanxx/score-boost-mini \
  --remote-npm-install
```

---

## 文件清单

### 云函数
```
cloudfunctions/
├── submitFeedback/
│   └── index.js
├── getMyFeedback/
│   └── index.js
├── markAsRead/
│   └── index.js
├── adminLogin/
│   └── index.js
├── getFeedbackList/
│   └── index.js
└── replyFeedback/
    └── index.js
```

### 小程序页面
```
pages/
├── feedback/
│   ├── feedback.wxml
│   ├── feedback.wxss
│   ├── feedback.js
│   └── feedback.json
├── feedback-list/
│   ├── feedback-list.wxml
│   ├── feedback-list.wxss
│   ├── feedback-list.js
│   └── feedback-list.json
└── feedback-detail/
    ├── feedback-detail.wxml
    ├── feedback-detail.wxss
    ├── feedback-detail.js
    └── feedback-detail.json
```

### 管理后台
```
admin/
├── login.html
├── index.html
└── detail.html
```
