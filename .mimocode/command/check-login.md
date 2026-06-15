---
description: Check login status for WeChat Developer Tools and CloudBase CLI (tcb)
---

# Check Login

Verify login status for both WeChat Developer Tools and CloudBase CLI.

## Usage

```
/check-login
```

## Procedure

### Step 1: Check WeChat DevTools login

```bash
"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" islogin --project /Users/seanxx/score-boost-mini 2>&1
```

### Step 2: Check tcb login

```bash
tcb login status 2>&1
```

### Step 3: Report

Report status for both. If either is not logged in, instruct user to:
- WeChat DevTools: Open the app and log in
- tcb: Run `tcb login` in terminal
