#!/usr/bin/env python3
"""
生成英语知识点数据文件
基于中国英语课程标准（1-9年级）
"""

import json
import os

# 小学英语知识点（1-6年级）
PRIMARY_ENGLISH_DATA = {
    "grade1": {
        "上册": [
            {
                "chapter_name": "第一单元 问候与介绍",
                "knowledge_points": [
                    {
                        "id": "english-grade1-up-1-1",
                        "name": "Hello与Goodbye",
                        "sub_topics": ["问候用语", "自我介绍", "告别用语"],
                        "typical_questions": ["选择题", "情景交际"],
                        "difficulty_weight": {"easy": 0.8, "medium": 0.2, "hard": 0}
                    },
                    {
                        "id": "english-grade1-up-1-2",
                        "name": "认识26个字母",
                        "sub_topics": ["字母认读", "字母书写", "字母发音"],
                        "typical_questions": ["选择题", "书写题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 颜色与数字",
                "knowledge_points": [
                    {
                        "id": "english-grade1-up-2-1",
                        "name": "颜色单词",
                        "sub_topics": ["基本颜色", "颜色问答", "颜色描述"],
                        "typical_questions": ["选择题", "连线题"],
                        "difficulty_weight": {"easy": 0.8, "medium": 0.2, "hard": 0}
                    },
                    {
                        "id": "english-grade1-up-2-2",
                        "name": "数字1-10",
                        "sub_topics": ["数字认读", "数数", "简单计算"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 家庭与身体",
                "knowledge_points": [
                    {
                        "id": "english-grade1-up-3-1",
                        "name": "家庭成员",
                        "sub_topics": ["父亲母亲", "兄弟姐妹", "祖父母"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.8, "medium": 0.2, "hard": 0}
                    },
                    {
                        "id": "english-grade1-up-3-2",
                        "name": "身体部位",
                        "sub_topics": ["头脸五官", "四肢身体", "身体动作"],
                        "typical_questions": ["选择题", "指认题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 食物与饮料",
                "knowledge_points": [
                    {
                        "id": "english-grade1-down-1-1",
                        "name": "常见食物",
                        "sub_topics": ["水果", "零食", "饮料"],
                        "typical_questions": ["选择题", "配对题"],
                        "difficulty_weight": {"easy": 0.8, "medium": 0.2, "hard": 0}
                    },
                    {
                        "id": "english-grade1-down-1-2",
                        "name": "饮食表达",
                        "sub_topics": ["喜欢表达", "询问喜好", "礼貌用语"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 动物与自然",
                "knowledge_points": [
                    {
                        "id": "english-grade1-down-2-1",
                        "name": "常见动物",
                        "sub_topics": ["家养动物", "野生动物", "昆虫"],
                        "typical_questions": ["选择题", "图片题"],
                        "difficulty_weight": {"easy": 0.8, "medium": 0.2, "hard": 0}
                    },
                    {
                        "id": "english-grade1-down-2-2",
                        "name": "自然现象",
                        "sub_topics": ["天气", "季节", "自然环境"],
                        "typical_questions": ["选择题", "描述题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 学校与学习",
                "knowledge_points": [
                    {
                        "id": "english-grade1-down-3-1",
                        "name": "学习用品",
                        "sub_topics": ["文具", "书包", "教室用品"],
                        "typical_questions": ["选择题", "分类题"],
                        "difficulty_weight": {"easy": 0.8, "medium": 0.2, "hard": 0}
                    },
                    {
                        "id": "english-grade1-down-3-2",
                        "name": "教室表达",
                        "sub_topics": ["教室指令", "课堂用语", "学校活动"],
                        "typical_questions": ["选择题", "听力题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            }
        ]
    },
    "grade2": {
        "上册": [
            {
                "chapter_name": "第一单元 日常活动",
                "knowledge_points": [
                    {
                        "id": "english-grade2-up-1-1",
                        "name": "日常动词",
                        "sub_topics": ["动作动词", "活动表达", "现在进行时"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade2-up-1-2",
                        "name": "时间表达",
                        "sub_topics": ["钟点时间", "日常时间", "时间顺序"],
                        "typical_questions": ["选择题", "问答题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 位置与方向",
                "knowledge_points": [
                    {
                        "id": "english-grade2-up-2-1",
                        "name": "介词in/on/under",
                        "sub_topics": ["位置介词", "方位表达", "空间描述"],
                        "typical_questions": ["选择题", "看图填空"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade2-up-2-2",
                        "name": "方向表达",
                        "sub_topics": ["左右", "前后", "上下"],
                        "typical_questions": ["选择题", "指认题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 衣服与穿着",
                "knowledge_points": [
                    {
                        "id": "english-grade2-up-3-1",
                        "name": "服装词汇",
                        "sub_topics": ["上衣下装", "鞋帽", "配饰"],
                        "typical_questions": ["选择题", "配对题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    },
                    {
                        "id": "english-grade2-up-3-2",
                        "name": "穿着表达",
                        "sub_topics": ["穿着描述", "天气与穿衣", "颜色搭配"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 职业与人物",
                "knowledge_points": [
                    {
                        "id": "english-grade2-down-1-1",
                        "name": "职业词汇",
                        "sub_topics": ["常见职业", "职业场所", "职业描述"],
                        "typical_questions": ["选择题", "配对题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    },
                    {
                        "id": "english-grade2-down-1-2",
                        "name": "人物描述",
                        "sub_topics": ["外貌特征", "性格特点", "能力表达"],
                        "typical_questions": ["选择题", "描述题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 交通与出行",
                "knowledge_points": [
                    {
                        "id": "english-grade2-down-2-1",
                        "name": "交通工具",
                        "sub_topics": ["常见车辆", "公共交通", "出行方式"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    },
                    {
                        "id": "english-grade2-down-2-2",
                        "name": "交通规则",
                        "sub_topics": ["红灯停绿灯行", "斑马线", "安全出行"],
                        "typical_questions": ["选择题", "判断题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 季节与天气",
                "knowledge_points": [
                    {
                        "id": "english-grade2-down-3-1",
                        "name": "四季词汇",
                        "sub_topics": ["春夏秋冬", "季节特征", "季节活动"],
                        "typical_questions": ["选择题", "配对题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    },
                    {
                        "id": "english-grade2-down-3-2",
                        "name": "天气描述",
                        "sub_topics": ["晴雨风雪", "温度", "天气活动"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    }
                ]
            }
        ]
    },
    "grade3": {
        "上册": [
            {
                "chapter_name": "第一单元 学校生活",
                "knowledge_points": [
                    {
                        "id": "english-grade3-up-1-1",
                        "name": "学校设施",
                        "sub_topics": ["教室操场", "图书馆", "功能室"],
                        "typical_questions": ["选择题", "翻译题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade3-up-1-2",
                        "name": "学科词汇",
                        "sub_topics": ["语文数学英语", "音乐美术体育", "科学道法"],
                        "typical_questions": ["选择题", "配对题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 家庭生活",
                "knowledge_points": [
                    {
                        "id": "english-grade3-up-2-1",
                        "name": "家庭活动",
                        "sub_topics": ["家务", "休闲", "节日"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade3-up-2-2",
                        "name": "房间名称",
                        "sub_topics": ["客厅卧室", "厨房浴室", "书房阳台"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.7, "medium": 0.3, "hard": 0}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 食物与健康",
                "knowledge_points": [
                    {
                        "id": "english-grade3-up-3-1",
                        "name": "三餐食物",
                        "sub_topics": ["早餐", "午餐", "晚餐"],
                        "typical_questions": ["选择题", "分类题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade3-up-3-2",
                        "name": "健康习惯",
                        "sub_topics": ["饮食健康", "运动锻炼", "作息规律"],
                        "typical_questions": ["选择题", "判断题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 动物世界",
                "knowledge_points": [
                    {
                        "id": "english-grade3-down-1-1",
                        "name": "动物分类",
                        "sub_topics": ["哺乳动物", "鸟类", "海洋生物"],
                        "typical_questions": ["选择题", "分类题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade3-down-1-2",
                        "name": "动物特征",
                        "sub_topics": ["外形", "习性", "栖息地"],
                        "typical_questions": ["选择题", "描述题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 节日与文化",
                "knowledge_points": [
                    {
                        "id": "english-grade3-down-2-1",
                        "name": "中西方节日",
                        "sub_topics": ["春节中秋", "圣诞感恩", "节日习俗"],
                        "typical_questions": ["选择题", "配对题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade3-down-2-2",
                        "name": "文化差异",
                        "sub_topics": ["饮食文化", "礼仪文化", "节日文化"],
                        "typical_questions": ["选择题", "判断题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 爱好与兴趣",
                "knowledge_points": [
                    {
                        "id": "english-grade3-down-3-1",
                        "name": "兴趣爱好",
                        "sub_topics": ["运动爱好", "艺术爱好", "其他爱好"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade3-down-3-2",
                        "name": "like/love句型",
                        "sub_topics": ["like doing", "love doing", "prefer doing"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            }
        ]
    },
    "grade4": {
        "上册": [
            {
                "chapter_name": "第一单元 语法入门",
                "knowledge_points": [
                    {
                        "id": "english-grade4-up-1-1",
                        "name": "be动词用法",
                        "sub_topics": ["am/is/are", "肯定句", "否定句疑问句"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    },
                    {
                        "id": "english-grade4-up-1-2",
                        "name": "人称代词",
                        "sub_topics": ["主格宾格", "形容词性物主代词", "名词性物主代词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 时态初步",
                "knowledge_points": [
                    {
                        "id": "english-grade4-up-2-1",
                        "name": "一般现在时",
                        "sub_topics": ["肯定句", "否定句疑问句", "第三人称单数"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade4-up-2-2",
                        "name": "现在进行时",
                        "sub_topics": ["be doing结构", "现在分词变化", "使用场景"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 日常交流",
                "knowledge_points": [
                    {
                        "id": "english-grade4-up-3-1",
                        "name": "电话用语",
                        "sub_topics": ["接听电话", "留言", "挂断电话"],
                        "typical_questions": ["选择题", "情景题"],
                        "difficulty_weight": {"easy": 0.6, "medium": 0.3, "hard": 0.1}
                    },
                    {
                        "id": "english-grade4-up-3-2",
                        "name": "邀请与应答",
                        "sub_topics": ["发出邀请", "接受拒绝", "约定时间"],
                        "typical_questions": ["选择题", "情景交际"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 过去的事情",
                "knowledge_points": [
                    {
                        "id": "english-grade4-down-1-1",
                        "name": "一般过去时",
                        "sub_topics": ["过去式构成", "规则变化", "不规则变化"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade4-down-1-2",
                        "name": "过去进行时",
                        "sub_topics": ["was/were doing", "使用场景", "与一般过去时区别"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 将来计划",
                "knowledge_points": [
                    {
                        "id": "english-grade4-down-2-1",
                        "name": "be going to",
                        "sub_topics": ["表示计划", "表示预测", "基本句型"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    },
                    {
                        "id": "english-grade4-down-2-2",
                        "name": "will表示将来",
                        "sub_topics": ["will基本用法", "will与be going to", "否定疑问形式"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 比较与对比",
                "knowledge_points": [
                    {
                        "id": "english-grade4-down-3-1",
                        "name": "形容词比较级",
                        "sub_topics": ["规则变化", "不规则变化", "比较句型"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade4-down-3-2",
                        "name": "形容词最高级",
                        "sub_topics": ["规则变化", "不规则变化", "最高级句型"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            }
        ]
    },
    "grade5": {
        "上册": [
            {
                "chapter_name": "第一单元 情态动词",
                "knowledge_points": [
                    {
                        "id": "english-grade5-up-1-1",
                        "name": "can/could",
                        "sub_topics": ["表示能力", "表示许可", "表示可能性"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade5-up-1-2",
                        "name": "must/should",
                        "sub_topics": ["表示必须", "表示建议", "否定形式"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 完成时态",
                "knowledge_points": [
                    {
                        "id": "english-grade5-up-2-1",
                        "name": "现在完成时",
                        "sub_topics": ["have/has done", "already/yet/ever", "for/since用法"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade5-up-2-2",
                        "name": "现在完成进行时",
                        "sub_topics": ["have/has been doing", "与现在完成时区别", "使用场景"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 被动语态",
                "knowledge_points": [
                    {
                        "id": "english-grade5-up-3-1",
                        "name": "被动语态构成",
                        "sub_topics": ["be done结构", "各时态被动", "get被动"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade5-up-3-2",
                        "name": "被动语态用法",
                        "sub_topics": ["不知道动作执行者", "强调动作承受者", "正式表达"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 复合句",
                "knowledge_points": [
                    {
                        "id": "english-grade5-down-1-1",
                        "name": "宾语从句",
                        "sub_topics": ["that引导", "if/whether引导", "wh-词引导"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade5-down-1-2",
                        "name": "状语从句",
                        "sub_topics": ["时间状语", "条件状语", "原因状语"],
                        "typical_questions": ["选择题", "连词填空"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 非谓语动词",
                "knowledge_points": [
                    {
                        "id": "english-grade5-down-2-1",
                        "name": "不定式to do",
                        "sub_topics": ["作宾语", "作目的状语", "固定搭配"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade5-down-2-2",
                        "name": "动名词doing",
                        "sub_topics": ["作主语", "作宾语", "固定搭配"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 介词与连词",
                "knowledge_points": [
                    {
                        "id": "english-grade5-down-3-1",
                        "name": "常用介词",
                        "sub_topics": ["时间介词", "地点介词", "方式介词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade5-down-3-2",
                        "name": "并列连词",
                        "sub_topics": ["and/but/or", "so/because", "表示并列转折因果"],
                        "typical_questions": ["选择题", "连词填空"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            }
        ]
    },
    "grade6": {
        "上册": [
            {
                "chapter_name": "第一单元 时态综合",
                "knowledge_points": [
                    {
                        "id": "english-grade6-up-1-1",
                        "name": "时态对比",
                        "sub_topics": ["一般时vs进行时", "完成时用法", "时态呼应"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade6-up-1-2",
                        "name": "过去完成时",
                        "sub_topics": ["had done", "与过去时区别", "使用场景"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 定语从句",
                "knowledge_points": [
                    {
                        "id": "english-grade6-up-2-1",
                        "name": "关系代词",
                        "sub_topics": ["who/whom", "which/that", "whose"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade6-up-2-2",
                        "name": "关系副词",
                        "sub_topics": ["where/when/why", "与关系代词选择", "介词+关系词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 主谓一致",
                "knowledge_points": [
                    {
                        "id": "english-grade6-up-3-1",
                        "name": "基本规则",
                        "sub_topics": ["单数主语", "复数主语", "不可数名词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade6-up-3-2",
                        "name": "特殊情况",
                        "sub_topics": ["集体名词", "就近原则", "数量词作主语"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 直接引语和间接引语",
                "knowledge_points": [
                    {
                        "id": "english-grade6-down-1-1",
                        "name": "陈述句转换",
                        "sub_topics": ["人称变化", "时态变化", "时间地点变化"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade6-down-1-2",
                        "name": "疑问句转换",
                        "sub_topics": ["一般疑问句", "特殊疑问句", "祈使句"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 虚拟语气",
                "knowledge_points": [
                    {
                        "id": "english-grade6-down-2-1",
                        "name": "条件句",
                        "sub_topics": ["真实条件句", "虚拟条件句", "混合条件句"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    },
                    {
                        "id": "english-grade6-down-2-2",
                        "name": "wish/if only",
                        "sub_topics": ["wish表达", "if only表达", "as if/as though"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 倒装与强调",
                "knowledge_points": [
                    {
                        "id": "english-grade6-down-3-1",
                        "name": "倒装句",
                        "sub_topics": ["完全倒装", "部分倒装", "倒装触发词"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    },
                    {
                        "id": "english-grade6-down-3-2",
                        "name": "强调句",
                        "sub_topics": ["It is...that", "强调成分", "强调句型变化"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            }
        ]
    }
}

# 初中英语知识点（7-9年级）
JUNIOR_ENGLISH_DATA = {
    "grade7": {
        "上册": [
            {
                "chapter_name": "第一单元 语法基础",
                "knowledge_points": [
                    {
                        "id": "english-grade7-up-1-1",
                        "name": "名词",
                        "sub_topics": ["可数不可数", "单数复数", "所有格"],
                        "typical_questions": ["选择题", "填空题", "词形转换"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-up-1-2",
                        "name": "冠词",
                        "sub_topics": ["不定冠词a/an", "定冠词the", "零冠词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-up-1-3",
                        "name": "数词",
                        "sub_topics": ["基数词", "序数词", "分数百分数"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 代词系统",
                "knowledge_points": [
                    {
                        "id": "english-grade7-up-2-1",
                        "name": "人称代词",
                        "sub_topics": ["主格宾格", "形容词性物主代词", "名词性物主代词", "反身代词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-up-2-2",
                        "name": "指示代词和疑问代词",
                        "sub_topics": ["this/that/these/those", "who/what/which", "whose/when/where/why"],
                        "typical_questions": ["选择题", "情景交际"],
                        "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 时态复习与扩展",
                "knowledge_points": [
                    {
                        "id": "english-grade7-up-3-1",
                        "name": "一般现在时",
                        "sub_topics": ["肯定否定疑问", "第三人称单数", "频度副词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-up-3-2",
                        "name": "一般过去时",
                        "sub_topics": ["规则动词过去式", "不规则动词", "时间状语"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-up-3-3",
                        "name": "一般将来时",
                        "sub_topics": ["will", "be going to", "present continuous for future"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第四单元 词汇扩展",
                "knowledge_points": [
                    {
                        "id": "english-grade7-up-4-1",
                        "name": "形容词和副词",
                        "sub_topics": ["形容词用法", "副词构成", "比较级最高级"],
                        "typical_questions": ["选择题", "词形转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade7-up-4-2",
                        "name": "介词短语",
                        "sub_topics": ["时间介词", "地点介词", "方式介词", "固定搭配"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 动词时态",
                "knowledge_points": [
                    {
                        "id": "english-grade7-down-1-1",
                        "name": "现在进行时",
                        "sub_topics": ["构成用法", "与一般现在时区别", "表示将来计划"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-down-1-2",
                        "name": "过去进行时",
                        "sub_topics": ["was/were doing", "特定时间背景", "与一般过去时配合"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 情态动词",
                "knowledge_points": [
                    {
                        "id": "english-grade7-down-2-1",
                        "name": "基本情态动词",
                        "sub_topics": ["can/could", "may/might", "must/have to"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade7-down-2-2",
                        "name": "情态动词表推测",
                        "sub_topics": ["must be", "may be", "can't be"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 句型结构",
                "knowledge_points": [
                    {
                        "id": "english-grade7-down-3-1",
                        "name": "There be句型",
                        "sub_topics": ["there is/are", "there have/has区别", "there be句型变化"],
                        "typical_questions": ["选择题", "填空题", "句型转换"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-down-3-2",
                        "name": "祈使句",
                        "sub_topics": ["肯定祈使", "否定祈使", "Let型祈使"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    },
                    {
                        "id": "english-grade7-down-3-3",
                        "name": "感叹句",
                        "sub_topics": ["What引导", "How引导", "感叹句转换"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第四单元 从句入门",
                "knowledge_points": [
                    {
                        "id": "english-grade7-down-4-1",
                        "name": "宾语从句",
                        "sub_topics": ["that引导", "wh-词引导", "if/whether引导", "语序问题"],
                        "typical_questions": ["选择题", "填空题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            }
        ]
    },
    "grade8": {
        "上册": [
            {
                "chapter_name": "第一单元 完成时态",
                "knowledge_points": [
                    {
                        "id": "english-grade8-up-1-1",
                        "name": "现在完成时",
                        "sub_topics": ["have/has done", "already/yet/ever/never", "for/since用法", "have been to vs have gone to"],
                        "typical_questions": ["选择题", "填空题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade8-up-1-2",
                        "name": "过去完成时",
                        "sub_topics": ["had done", "与过去时的区别", "过去完成时典型场景"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 被动语态",
                "knowledge_points": [
                    {
                        "id": "english-grade8-up-2-1",
                        "name": "被动语态构成",
                        "sub_topics": ["be + done", "各时态被动语态", "get被动"],
                        "typical_questions": ["选择题", "填空题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade8-up-2-2",
                        "name": "被动语态用法",
                        "sub_topics": ["不带by的被动", "短语动词被动", "双宾语被动"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 非谓语动词",
                "knowledge_points": [
                    {
                        "id": "english-grade8-up-3-1",
                        "name": "不定式to do",
                        "sub_topics": ["作宾语", "作目的状语", "作宾补", "省略to的不定式"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade8-up-3-2",
                        "name": "动名词和分词",
                        "sub_topics": ["动名词doing", "现在分词doing", "过去分词done"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 定语从句",
                "knowledge_points": [
                    {
                        "id": "english-grade8-down-1-1",
                        "name": "关系代词",
                        "sub_topics": ["who/whom/whose", "which/that", "关系代词省略"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade8-down-1-2",
                        "name": "关系副词",
                        "sub_topics": ["where/when/why", "介词+关系代词", "限制性vs非限制性"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 状语从句",
                "knowledge_points": [
                    {
                        "id": "english-grade8-down-2-1",
                        "name": "时间状语从句",
                        "sub_topics": ["when/while/as", "before/after", "until/till", "as soon as"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade8-down-2-2",
                        "name": "条件状语从句",
                        "sub_topics": ["if引导", "unless引导", "as long as引导"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade8-down-2-3",
                        "name": "原因/结果/让步状语",
                        "sub_topics": ["because/since/as", "so/so that", "although/though"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 直接引语和间接引语",
                "knowledge_points": [
                    {
                        "id": "english-grade8-down-3-1",
                        "name": "陈述句转换",
                        "sub_topics": ["人称变化", "时态变化", "时间地点变化"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade8-down-3-2",
                        "name": "疑问句转换",
                        "sub_topics": ["一般疑问句", "特殊疑问句", "祈使句"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            }
        ]
    },
    "grade9": {
        "上册": [
            {
                "chapter_name": "第一单元 语法综合复习",
                "knowledge_points": [
                    {
                        "id": "english-grade9-up-1-1",
                        "name": "时态综合",
                        "sub_topics": ["10种时态对比", "时态呼应", "时态与时间状语"],
                        "typical_questions": ["选择题", "填空题", "动词填空"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    },
                    {
                        "id": "english-grade9-up-1-2",
                        "name": "语态综合",
                        "sub_topics": ["主动被动转换", "复合句被动", "非谓语被动"],
                        "typical_questions": ["选择题", "句型转换", "短文填空"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 从句综合",
                "knowledge_points": [
                    {
                        "id": "english-grade9-up-2-1",
                        "name": "名词性从句",
                        "sub_topics": ["主语从句", "宾语从句", "表语从句", "同位语从句"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    },
                    {
                        "id": "english-grade9-up-2-2",
                        "name": "定语从句进阶",
                        "sub_topics": ["非限制性定语从句", "as/which引导", "介词+关系词"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    },
                    {
                        "id": "english-grade9-up-2-3",
                        "name": "状语从句进阶",
                        "sub_topics": ["方式状语", "目的状语", "结果状语", "比较状语"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 特殊句式",
                "knowledge_points": [
                    {
                        "id": "english-grade9-up-3-1",
                        "name": "主谓一致",
                        "sub_topics": ["语法一致", "意义一致", "就近原则"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade9-up-3-2",
                        "name": "倒装句",
                        "sub_topics": ["完全倒装", "部分倒装", "倒装触发词"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    },
                    {
                        "id": "english-grade9-up-3-3",
                        "name": "强调句",
                        "sub_topics": ["It is...that", "强调成分", "强调句型辨析"],
                        "typical_questions": ["选择题", "句型转换"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    }
                ]
            }
        ],
        "下册": [
            {
                "chapter_name": "第一单元 高级语法",
                "knowledge_points": [
                    {
                        "id": "english-grade9-down-1-1",
                        "name": "虚拟语气",
                        "sub_topics": ["条件句虚拟", "wish虚拟", "as if虚拟", "suggest等词后虚拟"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.3, "hard": 0.5}
                    },
                    {
                        "id": "english-grade9-down-1-2",
                        "name": "独立主格",
                        "sub_topics": ["with结构", "独立主格构成", "独立主格用法"],
                        "typical_questions": ["选择题", "填空题"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.3, "hard": 0.5}
                    }
                ]
            },
            {
                "chapter_name": "第二单元 构词法",
                "knowledge_points": [
                    {
                        "id": "english-grade9-down-2-1",
                        "name": "派生法",
                        "sub_topics": ["前缀", "后缀", "词性转换"],
                        "typical_questions": ["词形转换", "填空题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade9-down-2-2",
                        "name": "合成法与转化法",
                        "sub_topics": ["合成词", "词类转化"],
                        "typical_questions": ["词形转换", "选择题"],
                        "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}
                    }
                ]
            },
            {
                "chapter_name": "第三单元 阅读与写作技巧",
                "knowledge_points": [
                    {
                        "id": "english-grade9-down-3-1",
                        "name": "阅读理解技巧",
                        "sub_topics": ["主旨大意", "细节理解", "推理判断", "词义猜测"],
                        "typical_questions": ["阅读理解", "判断题"],
                        "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}
                    },
                    {
                        "id": "english-grade9-down-3-2",
                        "name": "写作技巧",
                        "sub_topics": ["议论文", "说明文", "记叙文", "应用文"],
                        "typical_questions": ["写作题", "句型转换"],
                        "difficulty_weight": {"easy": 0.2, "medium": 0.4, "hard": 0.4}
                    }
                ]
            }
        ]
    }
}

def create_english_file(grade, semester, chapters, output_dir):
    """创建单个英语知识点文件"""
    grade_num = int(grade.replace("grade", ""))
    data = {
        "subject": "英语",
        "grade": str(grade_num),
        "semester": semester,
        "version": "人教版",
        "chapters": chapters
    }

    semester_map = {'上册': 'up', '下册': 'down', '上': 'up', '下': 'down'}
    semester_en = semester_map.get(semester, semester)
    filename = f"english-grade{grade_num}-{semester_en}.json"
    filepath = os.path.join(output_dir, filename)

    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Created: {filename}")

def main():
    # 获取当前脚本所在目录的data子目录
    script_dir = os.path.dirname(os.path.abspath(__file__))
    output_dir = os.path.join(script_dir, "startAssessment", "data")

    # 确保输出目录存在
    os.makedirs(output_dir, exist_ok=True)

    print("Generating English knowledge points files...")

    # 生成小学文件（1-6年级）
    for grade_num in range(1, 7):
        grade_key = f"grade{grade_num}"
        if grade_key in PRIMARY_ENGLISH_DATA:
            for semester, chapters in PRIMARY_ENGLISH_DATA[grade_key].items():
                create_english_file(grade_key, semester, chapters, output_dir)

    # 生成初中文件（7-9年级）
    for grade_num in range(7, 10):
        grade_key = f"grade{grade_num}"
        if grade_key in JUNIOR_ENGLISH_DATA:
            for semester, chapters in JUNIOR_ENGLISH_DATA[grade_key].items():
                create_english_file(grade_key, semester, chapters, output_dir)

    print("\nAll English knowledge points files generated successfully!")
    print(f"Output directory: {output_dir}")

if __name__ == "__main__":
    main()
