#!/bin/bash

# 推广内容一键复制脚本
# 使用方法：./publish.sh [渠道]

CHANNEL=$1

case $CHANNEL in
  "wechat"|"朋友圈")
    cat << 'EOF'
🔥 生地会考最后30天！

推荐「日日守护」AI复习小程序：
✅ AI自动找薄弱点
✅ 生成专属题目（不是题库抽题！）
✅ 自适应难度，每天15分钟

我家孩子用了30天，从65分→88分！

详细介绍：https://xiaohoumin3-alt.github.io/score-boost/
微信搜「日日守护」开始复习

#生地会考 #初中学习 #AI复习
EOF
    ;;

  "group"|"家长群")
    cat << 'EOF'
各位家长好！

分享一个生地会考复习工具，我家孩子用了30天，生物地理从65分提升到88分！

「日日守护」小程序：
- AI自动识别孩子薄弱点
- 生成专属练习题目
- 每天15-20分钟就够了

关键是：它不是题库抽题，而是AI根据孩子的答题情况实时生成新题。

详细了解：https://xiaohoumin3-alt.github.io/score-boost/
微信搜「日日守护」，建议让孩子试试。
EOF
    ;;

  "xiaohongshu"|"小红书")
    cat << 'EOF'
标题：生地会考30天逆袭！从65分到88分的秘密📈

最后30天！发现一个AI复习神器，必须分享！

🤖 日日守护小程序，和传统刷题完全不同：

核心功能：
1️⃣ AI个性化出题 - 不是题库抽题，是根据薄弱点实时生成
2️⃣ 自适应难度 - 连续对3题降难度，连续错2题升难度
3️⃣ 智能提示 - 不是直接给答案，分级提示培养思考
4️⃣ Memory系统 - 记住学习情况，自动生成复习计划

📊 使用效果：
起始65分 → 30天后88分，提升+23分！

🔥 立即开始：微信搜"日日守护"
详细介绍：https://xiaohoumin3-alt.github.io/score-boost/

#生地会考 #初中学习 #AI学习 #学习神器 #提分秘籍 #会考冲刺
EOF
    ;;

  "link")
    echo "https://xiaohoumin3-alt.github.io/score-boost/"
    ;;

  *)
    echo "用法: ./publish.sh [渠道]"
    echo ""
    echo "可用渠道:"
    echo "  wechat, 朋友圈    - 微信朋友圈文案"
    echo "  group, 家长群     - 家长群文案"
    echo "  xiaohongshu, 小红书 - 小红书笔记"
    echo "  link              - 落地页链接"
    exit 1
    ;;
esac
