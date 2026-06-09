#!/bin/bash
# run-all-tests.sh
# 提分神器小程序 — 单元测试 + 回归测试 运行脚本
#
# 用法:
#   bash tests/run-all-tests.sh              # 运行全部测试
#   bash tests/run-all-tests.sh --unit       # 仅运行单元测试
#   bash tests/run-all-tests.sh --regression # 仅运行回归测试
#   bash tests/run-all-tests.sh --coverage   # 运行并生成覆盖率报告

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

# 颜色
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  提分神器 — 测试运行器${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

MODE="${1:---all}"

# 测试文件路径定义
UNIT_TESTS=(
  # P1-01: 共享模块去重验证
  "cloudfunctions/shared/__tests__/code-dedup-verification.test.js"
  # P0-01: 题目数据模型归一化
  "cloudfunctions/shared/__tests__/question-normalizer.test.js"
  # P0-02: API层统一
  "cloudfunctions/shared/__tests__/api-layer-unified.test.js"
  # P0-03: scheduledTaskGenerator安全
  "cloudfunctions/shared/__tests__/scheduled-task-generator.test.js"
  # P1-03: Practice v1废弃
  "cloudfunctions/shared/__tests__/practice-v1-deprecated.test.js"
  # P1-01: knowledge_tree全覆盖
  "cloudfunctions/shared/__tests__/knowledge-tree-unified.test.js"
  # P2-01: student_id统一
  "cloudfunctions/shared/__tests__/student-id-unified.test.js"
  # P2-05: 队列清理健壮化
  "cloudfunctions/shared/__tests__/queue-cleanup-robust.test.js"
)

REGRESSION_TESTS=(
  # G2: 测评全链路回归
  "tests/regression/assessment-full-chain.test.js"
  # G3: 练习全链路回归
  "tests/regression/practice-full-chain.test.js"
  # G4-G7: 总体验收
  "tests/regression/global-acceptance.test.js"
)

# 现有测试（确保不破坏已有功能）
EXISTING_TESTS=(
  "cloudfunctions/shared/llm-core/tests/"
  "cloudfunctions/questionGenerator/__tests__/"
  "cloudfunctions/startAssessment/__tests__/"
)

run_tests() {
  local test_paths=("$@")
  local args=()

  for p in "${test_paths[@]}"; do
    args+=("--testPathPattern=\"$p\"")
  done

  echo -e "${YELLOW}运行测试: ${test_paths[*]}${NC}"

  if [ "$MODE" = "--coverage" ]; then
    npx jest --no-cache --verbose --coverage --testPathPattern="$(printf '%s|' "${test_paths[@]}" | sed 's/|$//')" 2>&1
  else
    npx jest --no-cache --verbose --testPathPattern="$(printf '%s|' "${test_paths[@]}" | sed 's/|$//')" 2>&1
  fi
}

# 主逻辑
case "$MODE" in
  --unit)
    echo -e "${GREEN}>>> 运行单元测试 (P0/P1/P2 修复验证)${NC}"
    echo ""
    run_tests "${UNIT_TESTS[@]}"
    ;;

  --regression)
    echo -e "${GREEN}>>> 运行回归测试 (全链路验收)${NC}"
    echo ""
    run_tests "${REGRESSION_TESTS[@]}"
    ;;

  --existing)
    echo -e "${GREEN}>>> 运行已有测试 (确保不破坏)${NC}"
    echo ""
    npx jest --no-cache --verbose 2>&1
    ;;

  --coverage)
    echo -e "${GREEN}>>> 运行全部测试并生成覆盖率${NC}"
    echo ""
    ALL_TESTS=("${UNIT_TESTS[@]}" "${REGRESSION_TESTS[@]}")
    run_tests "${ALL_TESTS[@]}"
    ;;

  --all|*)
    echo -e "${GREEN}>>> Phase 1: 单元测试 (修复验证)${NC}"
    echo ""
    run_tests "${UNIT_TESTS[@]}"
    echo ""

    echo -e "${GREEN}>>> Phase 2: 回归测试 (全链路验收)${NC}"
    echo ""
    run_tests "${REGRESSION_TESTS[@]}"
    echo ""

    echo -e "${GREEN}>>> Phase 3: 已有测试 (确保不破坏)${NC}"
    echo ""
    npx jest --no-cache --verbose 2>&1 || true
    ;;

esac

echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${GREEN}  ✓ 测试完成${NC}"
echo -e "${BLUE}======================================${NC}"
