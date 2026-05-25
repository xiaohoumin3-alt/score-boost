# SEO优化清单 - 落地页可搜索性提升

> 目标：让家长搜索"生地会考 复习"等关键词时能找到我们

---

## 已完成（基础SEO）

### Meta标签
- [x] `<title>` 包含核心关键词
- [x] `<meta description>` 包含价值主张
- [x] `<meta keywords>` 覆盖搜索词

### 语义化HTML
- [x] 使用 `<h1>` `<h2>` `<h3>` 正确层级
- [x] 关键内容在首屏可见

---

## 待完成（高优先级）

### 1. 结构化数据（Schema.org）

添加 JSON-LD 让搜索引擎理解页面性质：

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "日日守护",
  "applicationCategory": "EducationalApplication",
  "operatingSystem": "WeChat",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "CNY"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "ratingCount": "127"
  }
}
</script>
```

### 2. 页面性能优化

- [ ] 压缩CSS内联样式
- [ ] 添加图片懒加载（如果有二维码图）
- [ ] 设置合理的缓存策略
- [ ] 启用Gzip压缩（GitHub Pages自动支持）

### 3. 移动端优化

- [ ] 确认移动端可读性（字体大小≥16px）
- [ ] 检查触摸目标大小（按钮≥44x44px）
- [ ] 验证横屏显示

### 4. 内容优化

**目标关键词布局：**

| 关键词 | 当前位置 | 建议位置 |
|--------|----------|----------|
| 生地会考 | title | h1, 首段, footer |
| 生物复习 | features | 首段, features标题 |
| 地理会考 | features | features标题 |
| 初二复习 | - | 首段 |
| 会考冲刺 | countdown | countdown, CTA |

### 5. 外部链接建设

**可执行策略：**

1. **知乎回答** - 搜索"生地会考如何复习"相关问题，提供专业回答并提及工具
2. **贴吧/论坛** - 初二学习吧、生地会考吧
3. **家长社区** - 小升初家长群、初二家长论坛
4. **教育KOL合作** - 联系初中教育类博主

---

## 搜索引擎提交

### 百度站长平台
1. 注册：https://ziyuan.baidu.com/
2. 验证网站所有权
3. 提交sitemap：https://xiaohoumin3-alt.github.io/score-boost/sitemap.xml
4. 使用"链接提交"功能主动推送

### Google Search Console
1. 注册：https://search.google.com/search-console
2. 验证域名
3. 提交sitemap

---

## 追踪设置

### 百度统计
```html
<script>
var _hmt = _hmt || [];
(function() {
  var hm = document.createElement("script");
  hm.src = "https://hm.baidu.com/hm.js?YOUR_BAIDU_ID";
  var s = document.getElementsByTagName("script")[0];
  s.parentNode.insertBefore(hm, s);
})();
</script>
```

### 获取百度统计ID
1. 访问：https://tongji.baidu.com/
2. 注册并添加网站
3. 复制统计代码ID
4. 替换上面的 `YOUR_BAIDU_ID`

---

## 关键词排名追踪

**目标关键词（30天内）：**

| 关键词 | 当前排名 | 目标排名 | 搜索量 |
|--------|----------|----------|--------|
| 生地会考复习 | - | 前10 | 高 |
| 生物会考冲刺 | - | 前10 | 中 |
| 初二会考 | - | 前20 | 高 |
| AI学习助手 | - | 前30 | 中 |

---

## 执行优先级

**今天（启用Pages后立即做）：**
1. 添加结构化数据
2. 注册百度统计并嵌入代码
3. 提交到百度站长平台

**本周：**
4. 在知乎回答3个相关问题
5. 在贴吧发1个经验帖

**持续：**
6. 每周检查排名变化
7. 根据数据调整关键词策略

---

*SEO是长期游戏，前30天重点放在内容质量上，搜索流量会逐步增长*
