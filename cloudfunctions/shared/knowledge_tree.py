"""
知识树加载和题目规划
"""

import json
import random
from typing import Dict, List, Optional


def load_knowledge_tree(subject: str, grade: str, semester: str = "下") -> Dict:
    """加载知识树数据"""
    # 微信云函数环境：从云存储或本地打包文件读取
    # 这里使用打包的静态数据
    try:
        import os
        data_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        data_file = os.path.join(data_dir, "..", "data", f"math-grade{grade}-{semester}.json")

        if os.path.exists(data_file):
            with open(data_file, "r", encoding="utf-8") as f:
                return json.load(f)

        # 备用：使用内嵌数据
        return _get_embedded_data(grade)
    except Exception:
        return _get_embedded_data(grade)


def _get_embedded_data(grade: str) -> Dict:
    """获取嵌入的知识树数据（8年级下册）"""
    return {
        "subject": "数学",
        "grade": grade,
        "semester": "下",
        "chapters": [
            {
                "id": "ch1",
                "name": "二次根式",
                "knowledge_points": [
                    {"id": "kp1_1", "name": "二次根式的概念", "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}},
                    {"id": "kp1_2", "name": "二次根式的性质", "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}},
                    {"id": "kp1_3", "name": "二次根式的运算", "difficulty_weight": {"easy": 0.3, "medium": 0.5, "hard": 0.2}},
                ]
            },
            {
                "id": "ch2",
                "name": "勾股定理",
                "knowledge_points": [
                    {"id": "kp2_1", "name": "勾股定理", "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}},
                    {"id": "kp2_2", "name": "勾股定理的逆定理", "difficulty_weight": {"easy": 0.3, "medium": 0.5, "hard": 0.2}},
                    {"id": "kp2_3", "name": "勾股定理的应用", "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}},
                ]
            },
            {
                "id": "ch3",
                "name": "平行四边形",
                "knowledge_points": [
                    {"id": "kp3_1", "name": "平行四边形的性质", "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}},
                    {"id": "kp3_2", "name": "平行四边形的判定", "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}},
                    {"id": "kp3_3", "name": "特殊的平行四边形", "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}},
                ]
            },
            {
                "id": "ch4",
                "name": "一次函数",
                "knowledge_points": [
                    {"id": "kp4_1", "name": "函数的概念", "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}},
                    {"id": "kp4_2", "name": "一次函数的图像", "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}},
                    {"id": "kp4_3", "name": "一次函数的应用", "difficulty_weight": {"easy": 0.3, "medium": 0.4, "hard": 0.3}},
                ]
            },
            {
                "id": "ch5",
                "name": "数据的分析",
                "knowledge_points": [
                    {"id": "kp5_1", "name": "数据的集中趋势", "difficulty_weight": {"easy": 0.5, "medium": 0.3, "hard": 0.2}},
                    {"id": "kp5_2", "name": "数据的波动程度", "difficulty_weight": {"easy": 0.4, "medium": 0.4, "hard": 0.2}},
                ]
            },
        ]
    }


def generate_question_plan(tree: Dict, num_questions: int, difficulty_distribution: Optional[Dict] = None) -> List[Dict]:
    """根据知识树和难度分布生成出题计划"""
    if difficulty_distribution is None:
        difficulty_distribution = {"easy": 0.5, "medium": 0.3, "hard": 0.2}

    # 收集所有知识点
    all_kps = []
    for chapter in tree.get("chapters", []):
        for kp in chapter.get("knowledge_points", []):
            all_kps.append({
                "kp_id": kp["id"],
                "kp_name": kp["name"],
                "chapter_name": chapter["name"],
                "chapter_id": chapter["id"],
                "weight": kp.get("difficulty_weight", {"easy": 0.5, "medium": 0.3, "hard": 0.2}),
            })

    # 计算每种难度的题目数量
    num_easy = int(num_questions * difficulty_distribution.get("easy", 0.5))
    num_medium = int(num_questions * difficulty_distribution.get("medium", 0.3))
    num_hard = num_questions - num_easy - num_medium

    # 按难度分配题目
    plan = []
    easy_kps = random.sample(all_kps, min(len(all_kps), num_easy))
    medium_kps = random.sample([k for k in all_kps if k not in easy_kps], min(len(all_kps) - len(easy_kps), num_medium))
    hard_kps = random.sample([k for k in all_kps if k not in easy_kps and k not in medium_kps], min(len(all_kps) - len(easy_kps) - len(medium_kps), num_hard))

    for kp in easy_kps:
        plan.append({"kp": kp, "difficulty": "easy"})
    for kp in medium_kps:
        plan.append({"kp": kp, "difficulty": "medium"})
    for kp in hard_kps:
        plan.append({"kp": kp, "difficulty": "hard"})

    # 如果题目不够，循环补充
    while len(plan) < num_questions:
        kp = random.choice(all_kps)
        diff = random.choice(["easy", "medium", "hard"])
        plan.append({"kp": kp, "difficulty": diff})

    random.shuffle(plan)
    return plan[:num_questions]
