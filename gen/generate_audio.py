# -*- coding: utf-8 -*-
"""產生發音檔（微軟神經語音），做法和 kim-english 一樣。

瀏覽器內建語音每支手機聽起來都不同，常常很機械。這支程式把
data/seed.js 裡所有英文（單字＋例句）事先合成成 mp3 放進 audio/，
網頁優先播這些檔案；沒有現成音檔的字（例如你自己在 App 裡加的）
才退回瀏覽器內建語音。

用法：
    pip3 install --user edge-tts
    python3 gen/generate_audio.py            # 只補產生缺少的
    python3 gen/generate_audio.py --force    # 全部重做（換聲音時用）

換聲音就改下面的 VOICE 再跑 --force。
可選：en-US-EmmaNeural / en-US-AvaNeural / en-US-AndrewNeural
      en-GB-SoniaNeural / en-GB-RyanNeural（英式，練雅思聽力可以用）
"""

import argparse, asyncio, os, sys
import edge_tts

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from seedlib import ROOT, load_words, key_of, normalize

VOICE = "en-US-EmmaNeural"   # 和 kim-english 同一個聲音
RATE = "+0%"                 # 正常語速
CONCURRENCY = 6              # 同時合成幾個，太高容易被伺服器擋

AUDIO_DIR = ROOT / "audio"
INDEX_JS = ROOT / "data" / "audio.js"


def collect_texts():
    """所有會被唸出來的英文：單字本身＋例句。"""
    texts, seen = [], set()
    for w in load_words():
        for t in (w.get("en"), w.get("ex")):
            t = normalize(t)
            if t and t not in seen:
                seen.add(t)
                texts.append(t)
    return texts


async def synth(text, path):
    tts = edge_tts.Communicate(text, VOICE, rate=RATE)
    tmp = str(path) + ".part"
    await tts.save(tmp)
    os.replace(tmp, path)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="全部重做")
    args = ap.parse_args()

    AUDIO_DIR.mkdir(exist_ok=True)
    texts = collect_texts()
    todo = [(t, AUDIO_DIR / (key_of(t) + ".mp3")) for t in texts]
    if not args.force:
        todo = [(t, p) for t, p in todo if not p.exists()]

    print(f"聲音 {VOICE}（語速 {RATE}）　共 {len(texts)} 句，這次要合成 {len(todo)} 句")
    done, failed = 0, []
    queue = asyncio.Queue()
    for item in todo:
        queue.put_nowait(item)

    async def worker():
        nonlocal done
        while not queue.empty():
            text, path = await queue.get()
            for attempt in range(3):
                try:
                    await synth(text, path)
                    break
                except Exception as e:
                    if attempt == 2:
                        failed.append((text, str(e)[:60]))
                    else:
                        await asyncio.sleep(1.5 * (attempt + 1))
            done += 1
            if done % 25 == 0:
                print(f"  … {done} / {len(todo)}", flush=True)
            queue.task_done()

    await asyncio.gather(*[worker() for _ in range(CONCURRENCY)])

    # 索引檔：把所有 key 接成一長串，網頁用它判斷有沒有現成音檔
    keys = sorted(key_of(t) for t in texts if (AUDIO_DIR / (key_of(t) + ".mp3")).exists())
    INDEX_JS.write_text(
        f"// 由 gen/generate_audio.py 自動產生，請勿手動修改\n"
        f"// 聲音：{VOICE}（語速 {RATE}），共 {len(keys)} 句\n"
        f'window.AUDIO_KEYS="{"".join(keys)}";\n',
        encoding="utf-8")

    print(f"完成：{len(keys)} 個音檔，索引寫入 data/audio.js")
    if failed:
        print(f"有 {len(failed)} 句失敗，再跑一次就會補上：")
        for t, e in failed[:10]:
            print(f"  · {t[:50]} — {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
