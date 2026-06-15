---
description: Run Jest tests for the score-boost-mini project with specific test file or all tests
---

# Run Test

Run Jest tests for the WeChat Mini Program project with proper configuration.

## Usage

```
/run-test [test_file_or_pattern] [--coverage]
```

## Parameters

- `$1` - (Optional) Test file name or pattern (e.g., `initDatabase`, `cloudApi-queue`, `practice.*integration`)
- `--coverage` - (Optional) Generate coverage report

## Procedure

### Step 1: Run tests

```bash
cd /Users/seanxx/score-boost-mini

if [ -n "$1" ]; then
  npm test -- "$1" 2>&1
else
  npm test 2>&1
fi
```

### Step 2: If coverage requested

```bash
npm run test:coverage 2>&1
```

### Step 3: Report results

Report: pass/fail count, any failing test names, coverage if requested.

## Common test patterns

- `npm test -- initDatabase` - Database initialization tests
- `npm test -- cloudApi-queue` - Cloud API queue tests
- `npm test -- practice.*integration` - Practice integration tests
- `npm test -- home` - Home page tests
- `npm test -- ai-question-consumer` - AI question consumer tests
- `npm test` - All tests
