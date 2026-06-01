"""
获取测评详情云函数
"""

import json
from typing import Dict, Optional


def main(event, context):
    """
    微信云函数入口
    event 包含: assessment_id
    """
    try:
        params = event.get("data", {}) or {}
        assessment_id = params.get("assessment_id")

        if not assessment_id:
            return {"success": False, "error": "assessment_id is required"}

        # 从云数据库加载会话
        session = _load_assessment_session(assessment_id)
        if not session:
            return {"success": False, "error": "Assessment not found"}

        return {
            "success": True,
            "data": {
                "assessment_id": assessment_id,
                "status": session.get("status", "in_progress"),
                "questions": session.get("questions", []),
                "time_limit_minutes": session.get("time_limit_minutes", 45),
            }
        }

    except Exception as e:
        return {"success": False, "error": str(e)}


def _load_assessment_session(assessment_id: str) -> Optional[Dict]:
    """加载测评会话"""
    try:
        try:
            import wxcloudrun
            db = wxcloudrun.get_db()
            if db:
                doc = db.collection("assessments").doc(assessment_id).get()
                return doc.data if doc.exists else None
        except ImportError:
            pass
        return None
    except Exception as e:
        print(f"_load_assessment_session error: {e}")
        return None
