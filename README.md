# IELTS 單字本

自己輸入單字 → Claude 產生中文、例句、例句翻譯 → 變成字卡、選擇題、拼字題。
純靜態網頁，資料存在瀏覽器裡，手機可以「加入主畫面」當 App 用。

## 平常怎麼用

**加新單字**

使用者目前是自己在 App 裡加字（「新增單字」→ 貼上單字 → 複製指令給 Claude → 貼回 JSON → 匯入），
牌組自己建（目前有「Sep 10」「Sep 11」）。資料在瀏覽器＋gist，不在 repo。
2026-09-11 已把 repo 裡預先準備的 127 個雅思字全部移除。

如果要 Claude Code 直接寫進 repo，在對話裡說就好：

> 幫我加這幾個字到單字本：resilient、advocate、mitigate

Claude 會產生中文、詞性、例句、例句翻譯，寫進 `data/seed.js`
並把 `SEED_VERSION` 加 1；下次打開網頁就會自動出現新的字。

也可以在 App 裡操作：「新增單字」→ 貼上單字 → 按「複製指令」→
貼到 Claude 對話 → 把回來的 JSON 貼回第 3 步 → 匯入。
（這條路的字只存在這台裝置的瀏覽器，換裝置會不見，記得偶爾備份。）

**背單字**

- **背字卡** — 中文那面在上，往左滑開遮版看英文，按「不認識／有點模糊／記得」
- **選擇題** — 中→英、英→中、例句填空三種隨機出；鍵盤 1～4 選答案、Enter 換下一題
- **拼字題** — 看中文和挖空的例句，把英文拼出來，卡住可以按提示逐字揭露
- **錯題複習** — 只練答錯過的字，可以選字卡、選擇題或拼字

答題結果會排進間隔複習：記得的字往後排（1→2→4→8→16 天），
答錯的字打回今天重來。首頁的「今天要複習」就是這樣算的。

**答題節奏**：第一次 Enter（或按「檢查」）確認答案，第二次 Enter 才換下一題。
答案揭曉後有 **0.5 秒**按不動，避免手快連按直接跳過、沒看到自己錯在哪。

**錯題**是「答錯過、而且還沒練熟」的字：連續答對到「４天後」那一級（box 3）就會自動從錯題清單消失。
錯越多次、越不熟的排越前面。所有時間都用台灣時間（UTC+8），不管裝置在哪個時區。

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
   note:"benchmark against 意為以…為基準比較",
   syn:"standard 標準；yardstick 衡量標準",       // 相似字：「word 中文；word 中文」
   ant:"",                                        // 相反字，沒有就空字串
   added:"2026-09-11"},                           // 加入日期
];
```

**相似字／相反字**（2026-09-11 起）：新加的字都要帶 `syn`（2～3 個）和 `ant`（1～2 個，沒有就空字串），
格式「word 中文；word 中文」，用「；」分隔。字卡、單字表、答題回饋、錯題頁都會顯示成小標籤，點一下會發音。
之前的 127 個字沒有這兩欄，不補（使用者說不用動）。`gen/check.py` 會檢查 `added >= 2026-09-11` 的字有沒有帶。

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

## 跨裝置同步

進度存到你自己的 **GitHub secret gist**，電腦和手機共用同一份。免費，不用另外註冊服務。

**第一台裝置**
1. 到 <https://github.com/settings/tokens> → Generate new token (classic) → 只勾 **gist** → 複製
2. App 設定頁 → 跨裝置同步 → 貼上 token → 「開始同步」（會自動建立一個 secret gist）

**第二台裝置**
設定頁按「複製設定碼」，把那串 `VOC1....` 傳到另一台（LINE、備忘錄都行），
在那台的設定頁貼進「已經在另一台設定好了？」欄位 → 「用設定碼連上」。不用再產生 token。

之後：**打開 App 自動拉最新進度，離開或做完一輪測驗自動上傳**。

合併方式不是「後蓋前」，是逐筆比時間戳：

| 資料 | 合併規則 |
|---|---|
| 熟練度 `prog` | 每個字各自比 `at`，晚練的那台贏 |
| 單字 `words` | 同上；刪掉的字留墓碑 `gone`，不會從另一台復活 |
| 測驗紀錄 `quiz` | 兩邊聯集，用時間＋分數去重 |
| 設定（token、API key） | **不同步**，各裝置獨立 |

所以手機和電腦各背各的，之後同步不會互相蓋掉。

token 只存在各裝置的 localStorage，不會進 repo，也不會傳到 GitHub 以外的地方。
只勾 `gist` 權限的 token 就算外流，最多也只能動你的 gist，碰不到 repo。

## 資料保存

單字和進度都在瀏覽器的 localStorage（key: `myVocabApp`）。
清除瀏覽器資料會一起消失 —— 設定頁有「下載備份檔」和「從備份檔還原」。
寫進 `data/seed.js` 的字則跟著檔案走，不受影響。

## 選配：讓 App 自己生成

設定頁 → 進階，填入 Anthropic API key（`console.anthropic.com` 申請）之後，
「新增單字」頁會多一顆「直接自動生成」，不用再複製貼上。
key 只存在這台裝置的瀏覽器，不會傳到其他地方。平常不填也完全能用。

## 上線與自動更新

推上線一律用：

```bash
gen/deploy.sh "commit 訊息"
```

它會依序：`check.py` 檢查資料 → `generate_audio.py` 補發音 → `stamp.py` 蓋版本章 → commit → push。

**版本章**（`gen/stamp.py`）解決「推了新版要重新整理好幾次才看得到」：
- 所有 HTML 的 `js/`、`css/`、`data/` 引用都帶 `?v=<版本>`，HTML 一換，資源一定重抓
- 產生 `version.json`，App 每次打開（和切回前景時）帶 `?t=時間` 去問有沒有新版，
  有就自己帶 `?v=新版` 重新載入一次（繞過 GitHub Pages 的 10 分鐘 CDN 快取）
- 練習中途（字卡／選擇題／拼字）不會突然重載，只提示「回首頁會更新」

**一次性整理**（`data/seed.js` 的 `SEED_MIGRATE`）：要幫使用者刪牌組、改名時用，
`v` 對到 `SEED_VERSION`，每台裝置只執行一次；刪掉的東西留墓碑（`gone`／`goneDecks`），同步不會復活。

## 本機預覽

```bash
cd vocab-app && python3 -m http.server 8877
```
瀏覽器打開 http://localhost:8877
