#!/usr/bin/env python3
"""檢查 data/seed.js：欄位齊全、例句真的含該單字、沒有重複字。"""
import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seedlib import load_words, seed_version

words = load_words()
ver = seed_version()

errs, warns = [], []
seen = {}
decks = {}
for i, w in enumerate(words):
    tag = f'[{i}] {w.get("en","???")}'
    for f in ("en", "zh", "ex", "exZh"):
        if not w.get(f):
            errs.append(f"{tag}：缺 {f}")
    en = w.get("en", "").lower()
    if en in seen:
        errs.append(f"{tag}：和第 {seen[en]} 筆重複")
    seen[en] = i
    d = w.get("deck", "my")
    decks[d] = decks.get(d, 0) + 1
    # 例句要真的用到這個字（允許 -s/-ed/-ing、y→ies、不規則變化）
    ex, head = w.get("ex", ""), en.split()[0]
    stems = {head}
    if head.endswith("e"):
        stems.add(head[:-1])                    # make → making
    if head.endswith("y"):
        stems.add(head[:-1] + "i")              # subsidy → subsidies
    stems.add(head[:max(4, len(head) - 3)])     # overtake → overtook 這類不規則
    if not any(re.search(r"\b" + re.escape(s) + r"\w*", ex, re.I) for s in stems):
        errs.append(f'{tag}：例句沒用到這個字 → "{ex}"')
    n = len(ex.split())
    if n > 18:
        warns.append(f"{tag}：例句偏長（{n} 字）")
    if not w.get("note"):
        warns.append(f"{tag}：沒有 note")
    # 2026-09-11 起新加的字要帶相似字／相反字（舊字不補，他說不用動）
    if w.get("added", "") >= "2026-09-11":
        if not w.get("syn"):
            errs.append(f"{tag}：新字缺 syn（相似字）")
        if "ant" not in w:
            errs.append(f"{tag}：新字缺 ant 欄位（沒有相反字就給空字串）")
    for f in ("syn", "ant"):
        v = w.get(f, "")
        if v and not re.match(r"^[A-Za-z]", v):
            errs.append(f'{tag}：{f} 要以英文開頭，格式「word 中文；word 中文」 → "{v}"')

# 每個牌組的第一筆要帶 deckName / deckIcon
first = {}
for w in words:
    d = w.get("deck", "my")
    if d not in first:
        first[d] = w
        if not w.get("deckName"):
            errs.append(f'牌組 {d}：第一筆 ({w.get("en")}) 少了 deckName／deckIcon')

print(f"SEED_VERSION = {ver}　共 {len(words)} 個單字")
for d, n in decks.items():
    f = first[d]
    print(f'  {f.get("deckIcon","?")} {f.get("deckName",d):<10} {d:<8} {n:>3} 字')
if warns:
    print(f"\n提醒 {len(warns)} 則：")
    for w in warns[:12]:
        print("  ·", w)
if errs:
    print(f"\n❌ 錯誤 {len(errs)} 則：")
    for e in errs:
        print("  ·", e)
    sys.exit(1)
print("\n✅ 檢查通過")
