#!/usr/bin/env python3
"""蓋版本章：讓網頁自己知道「現在是哪一版」，並讓瀏覽器一定抓到新的 JS/CSS。

做兩件事：
1. 產生 data/version.js（頁面載入時知道自己的版本）和 version.json（App 上線後去問最新版）
2. 把所有 HTML 裡的 js/、css/、data/ 引用加上 ?v=<版本>，HTML 一更新，資源就一定重抓

每次推上線前跑一次（gen/deploy.sh 會自動跑）。
"""
import json, re, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
build = datetime.datetime.now().strftime("%Y%m%d.%H%M")

(ROOT / "data" / "version.js").write_text(
    f"// 由 gen/stamp.py 自動產生\nwindow.APP_BUILD = \"{build}\";\n", encoding="utf-8")
(ROOT / "version.json").write_text(json.dumps({"build": build}), encoding="utf-8")

pat = re.compile(r'((?:src|href)=")((?:js|css|data)/[^"?]+)(?:\?v=[^"]*)?(")')
n = 0
for html in ROOT.glob("*.html"):
    t = html.read_text(encoding="utf-8")
    t2, k = pat.subn(lambda m: f'{m.group(1)}{m.group(2)}?v={build}{m.group(3)}', t)
    # 每頁都要載入 version.js，才知道自己是哪一版
    if "data/version.js" not in t2:
        t2 = t2.replace('<script src="js/app.js', f'<script src="data/version.js?v={build}"></script>\n<script src="js/app.js', 1)
    if t2 != t:
        html.write_text(t2, encoding="utf-8")
        n += k
print(f"版本 {build}，更新了 {n} 個資源引用")
