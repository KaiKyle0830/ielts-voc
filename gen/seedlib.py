# -*- coding: utf-8 -*-
"""讀 data/seed.js —— check.py 和 generate_audio.py 共用。"""
import json, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SEED = ROOT / "data" / "seed.js"


def load_words():
    text = SEED.read_text(encoding="utf-8")
    body = text[text.index("SEED_WORDS"):]
    body = body[body.index("["): body.rindex("]") + 1]
    body = re.sub(r"/\*.*?\*/", "", body, flags=re.S)                 # 去掉註解
    body = re.sub(r"([{,]\s*)([A-Za-z_]\w*)\s*:", r'\1"\2":', body)   # 鍵補引號
    body = re.sub(r",\s*([}\]])", r"\1", body)                        # 去掉多餘逗號
    return json.loads(body)


def seed_version():
    m = re.search(r"SEED_VERSION\s*=\s*(\d+)", SEED.read_text(encoding="utf-8"))
    return int(m.group(1)) if m else 0


def normalize(text):
    return re.sub(r"\s+", " ", (text or "")).strip()


def key_of(text):
    """FNV-1a 32-bit —— js/app.js 的 audioKey() 有一份一模一樣的實作。"""
    h = 2166136261
    for b in normalize(text).encode("utf-8"):
        h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    return format(h, "08x")
