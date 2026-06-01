"""
提交答案云函数
"""

import json
from datetime import datetime
from typing import Dict, List, Optional


def main(event, context):
    """
    微信云函数入口
    event 包含: assessment_id, answers (list of {question_id, answer})
    """
    try:
        params = event.get("data", {}) or {}
        assessment_id = params.get("assessment_id")
        answers = params.get("answers", [])

        if not assessment_id:
            return {"success": False, "error": "assessment_id is required"}

        if not answers:
            return {"success": False, "error": "answers is required"}

        # 获取测评会话
        session = _load_assessment_session(assessment_id)
        if not session:
            return {"success": False, "error": "Assessment not found"}

        # 构建题目映射
        question_map = {q["id"]: q for q in session.get("questions", [])}

        # 评判答案
        results = []
        total_correct = 0

        for answer in answers:
            question_id = answer.get("question_id")
            user_answer = answer.get("answer", "").upper().strip()

            question = question_map.get(question_id)
            if not question:
                continue

            correct = question.get("correct_answer", "").upper().strip()
            is_correct = user_answer == correct

            if is_correct:
                total_correct += 1

            results.append({
                "question_id": question_id,
                "content": question.get("content", ""),
                "user_answer": user_answer,
                "correct_answer": correct,
                "is_correct": is_correct,
                "knowledge_point": question.get("knowledge_point", ""),
                "knowledge_point_id": question.get("knowledge_point_id", ""),
                "difficulty": question.get("difficulty", ""),
            })

        # 计算分数
        total_questions = len(results)
        score_percent = round((total_correct / total_questions * 100), 1) if total_questions > 0 else 0

        # 按知识点统计
        kp_stats = {}
        for r in results:
            kp_id = r["knowledge_point_id"]
            kp_name = r["knowledge_point"]
            if kp_id not in kp_stats:
                kp_stats[kp_id] = {"name": kp_name, "correct": 0, "total": 0}
            kp_stats[kp_id]["total"] += 1
            if r["is_correct"]:
                kp_stats[kp_id]["correct"] += 1

        # 更新会话状态
        session["status"] = "completed"
        session["answers"] = answers
        session["results"] = results
        session["score"] = {
            "total_correct": total_correct,
            "total_questions": total_questions,
            "score_percent": score_percent,
        }
        session["kp_stats"] = kp_stats
        session["completed_at"] = datetime.now().isoformat()

        # 保存更新后的会话
        _save_assessment_session(assessment_id, session)

        # 构建返回
        return {
            "success": True,
            "data": {
                "assessment_id": assessment_id,
                "results": results,
                "total_correct": total_correct,
                "total_questions": total_questions,
                "score_percent": score_percent,
                "kp_stats": [
                    {"kp_id": kp_id, "kp_name": stats["name"],
                     "correct": stats["correct"], "total": stats["total"]}
                    for kp_id, stats in kp_stats.items()
                ],
            }
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def _load_assessment_session(assessment_id: str) -> Optional[Dict]:
    """加载测评会话"""
    try:
        # 尝试从云数据库加载
        try:
            import wxcloudrun
            db = wxcloudrun.get_db()
            if db:
                doc = db.collection("assessments").doc(assessment_id).get()
                return doc.data if doc.exists else None
        except ImportError:
            pass

        # 降级：返回None，让客户端处理
        return None

    except Exception as e:
        print(f"_load_assessment_session error: {e}")
        return None


def _save_assessment_session(assessment_id: str, session_data: Dict):
    """保存测评会话"""
    try:
        try:
            import wxcloudrun
            db = wxcloudrun.get_db()
            if db:
                db.collection("assessments").doc(assessment_id).set(session_data)
                return
        except ImportError:
            pass

        print(f"[Cloud] Would save assessment {assessment_id} to cloud")
    except Exception as e:
        print(f"_save_assessment_session error: {e}")
