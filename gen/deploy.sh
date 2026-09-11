#!/bin/sh
# 一鍵上線：檢查資料 → 補發音 → 蓋版本章 → commit → push
# 用法：gen/deploy.sh "commit 訊息"
set -e
cd "$(dirname "$0")/.."
python3 gen/check.py
python3 gen/generate_audio.py
python3 gen/stamp.py
git add -A
git -c user.name="kylehuang20060830" -c user.email="kylehuang20060830@gmail.com" \
  commit -q -m "${1:-更新}

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -q origin main
echo "已推上線，約 1～2 分鐘後 App 會自己更新"
