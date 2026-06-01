"""
开始测评云函数
"""

import random
import uuid
import time
import json
from datetime import datetime
from typing import Optional, Dict, List

# 导入共享模块
from shared.knowledge_tree import load_knowledge_tree, generate_question_plan
from shared.question_bank import generate_questions


def main(event, context):
    """
    微信云函数入口
    event 包含: subject, grade, semester, mode, num_questions, student_id
    """
    try:
        # 解析参数
        params = event.get("data", {}) or {}
        subject = params.get("subject", "math")
        grade = str(params.get("grade", "8"))
        semester = params.get("semester", "下")
        mode = params.get("mode", "pre_test")
        num_questions = int(params.get("num_questions", 5))
        student_id = params.get("student_id")

        # 生成测评ID
        assessment_id = str(uuid.uuid4())

        # 加载知识树
        tree = load_knowledge_tree(subject, grade, semester)

        # 生成出题计划
        plan = generate_question_plan(tree, num_questions)

        # 生成题目
        questions = generate_questions(plan, num_questions)

        # 构建返回数据
        result = {
            "assessment_id": assessment_id,
            "status": "ready",
            "questions": [
                {
                    "id": q["id"],
                    "type": q["type"],
                    "content": q["content"],
                    "options": q["options"],
                    "knowledge_point": q["knowledge_point"],
                    "knowledge_point_id": q["knowledge_point_id"],
                    "difficulty": q["difficulty"],
                }
                for q in questions
            ],
            "time_limit_minutes": 45 if mode == "pre_test" else 30,
        }

        # 存储session到云数据库
        _save_assessment_session(assessment_id, {
            "assessment_id": assessment_id,
            "subject": subject,
            "grade": grade,
            "semester": semester,
            "mode": mode,
            "questions": questions,
            "time_limit_minutes": result["time_limit_minutes"],
            "status": "in_progress",
            "answers": [],
            "created_at": datetime.now().isoformat(),
            "student_id": student_id,
        })

        return {"success": True, "data": result}

    except Exception as e:
        return {"success": False, "error": str(e)}


def _save_assessment_session(assessment_id: str, session_data: Dict):
    """保存测评会话到云数据库"""
    try:
        import os
        # 云函数环境优先使用云数据库
        try:
            from tencentcloud.common import credential
            from tencentcloud.common.profile.client_profile import ClientProfile
            from tencentcloud.common.profile.http_profile import HttpProfile
            from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
            from tencentcloud.scf.v20180416 import scf_client, models
            import boto3

            # 使用微信云开发云数据库
            db = get_cloud_db()
            if db:
                db.collection("assessments").doc(assessment_id).set(session_data)
                return
        except ImportError:
            pass

        # 降级：使用云存储
        save_to_cloud_storage(assessment_id, session_data)

    except Exception as e:
        print(f"_save_assessment_session error: {e}")


def get_cloud_db():
    """获取云数据库连接"""
    try:
        import wxcloudrun
        return wxcloudrun.get_db()
    except:
        return None


def save_to_cloud_storage(assessment_id: str, data: Dict):
    """保存到云存储作为备选"""
    # 在实际的微信云函数中，这里会使用COS或其他云存储
    # 当前实现只是打印，实际部署时需要配置
    print(f"[Cloud] Would save assessment {assessment_id} to cloud storage")
