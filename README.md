# IELTS 單字本

自己輸入單字 → Claude 產生中文、例句、例句翻譯 → 變成字卡、選擇題、拼字題。
純靜態網頁，資料存在瀏覽器裡，手機可以「加入主畫面」當 App 用。

## 平常怎麼用

**加新單字（主要流程）**

在 Claude Code 對話裡直接說就好：

> 幫我加這幾個字到單字本：resilient、advocate、mitigate

Claude 會產生中文、詞性、例句、例句翻譯，寫進 `data/seed.js`
並把 `SEED_VERSION` 加 1；下次打開網頁就會自動出現新的字。

也可以在 App 裡操作：「新增單字」→ 貼上單字 → 按「複製指令」→
貼到 Claude 對話 → 把回來的 JSON 貼回第 3 步 → 匯入。
（這條路的字只存在這台裝置的瀏覽器，換裝置會不見，記得偶爾備份。）

**背單字**

- **背字卡** — 中文那面在上，往左滑開遮版看英文，按「不認識／有點模糊／記得」
- **選擇題** — 中→英、英→中、例句填空三種隨機出
- **拼字題** — 看中文和挖空的例句，把英文拼出來，卡住可以按提示逐字揭露

答題結果會排進間隔複習：記得的字往後排（1→2→4→8→16 天），
答錯的字打回今天重來。首頁的「今天要複習」就是這樣算的。

## 檔案

| 檔案 | 作用 |
|---|---|
| `data/seed.js` | Claude 寫進來的單字。**加字就是改這個檔** |
| `data/audio.js` | 發音檔索引，由 `gen/generate_audio.py` 自動產生 |
| `audio/*.mp3` | 事先合成的發音（微軟神經語音） |
| `gen/generate_audio.py` | 產生發音檔；`gen/check.py` 檢查 seed.js |
| `js/app.js` | 資料層、間隔複習、發音、共用工具 |
| `js/ai.js` | 產生給 Claude 的指令、解析 JSON、（選配）直接呼叫 API |
| `index.html` | 首頁 |
| `cards.html` / `mcq.html` / `spell.html` | 字卡 / 選擇題 / 拼字題 |
| `list.html` | 單字表（連點兩下可以編輯或刪除） |
| `add.html` / `decks.html` / `settings.html` | 新增單字 / 牌組管理 / 設定備份 |

### seed.js 的規則

```js
window.SEED_VERSION = 3;          // 每次加字都要 +1，不然不會重新匯入
window.SEED_WORDS = [
  {deck:"toeic", deckName:"多益單字", deckIcon:"📗",   // 每組第一筆才需要 deckName/deckIcon
   en:"benchmark", pos:"n./v.", zh:"基準；標竿",
   ex:"This model sets a new benchmark for speed.",
   exZh:"這個模型為速度立下新標竿。",
   note:"benchmark against 意為以…為基準比較"},
];
```

匯入時以英文字為準：已經存在的字不會覆蓋，所以你在 App 裡改過的內容不會被蓋掉。

## 發音

單字和例句都事先用微軟神經語音（`en-US-EmmaNeural`，正常語速）合成成 mp3 放在 `audio/`，
和 kim-english 同一套做法，每台裝置聽起來都一樣。檔名是句子的 FNV-1a 雜湊，
`data/audio.js` 存所有檔名，網頁播之前先查有沒有現成音檔，沒有才退回裝置內建語音。

**加完新單字一定要補產生發音**：

```bash
pip3 install --user edge-tts        # 只需裝一次
python3 gen/check.py                # 先確認 seed.js 沒問題
python3 gen/generate_audio.py       # 只會補產生缺少的
```

換聲音就改 `gen/generate_audio.py` 裡的 `VOICE` 再跑 `--force` 全部重做。
想練英式聽力可以換成 `en-GB-SoniaNeural` 或 `en-GB-RyanNeural`。

iPhone 開靜音模式時聽不到 mp3（iOS 的限制），設定頁可以勾「一律改用裝置內建語音」。

## 資料保存

單字和進度都在瀏覽器的 localStorage（key: `myVocabApp`）。
清除瀏覽器資料會一起消失 —— 設定頁有「下載備份檔」和「從備份檔還原」。
寫進 `data/seed.js` 的字則跟著檔案走，不受影響。

## 選配：讓 App 自己生成

設定頁 → 進階，填入 Anthropic API key（`console.anthropic.com` 申請）之後，
「新增單字」頁會多一顆「直接自動生成」，不用再複製貼上。
key 只存在這台裝置的瀏覽器，不會傳到其他地方。平常不填也完全能用。

## 本機預覽

```bash
cd vocab-app && python3 -m http.server 8877
```
瀏覽器打開 http://localhost:8877
