/* 跨裝置同步 —— 把進度存在你自己的 GitHub secret gist 裡。

   為什麼用 gist：免費、你本來就有 GitHub 帳號、API 支援跨網域呼叫，
   而且 secret gist 不會被搜尋到。token 只存在各裝置的瀏覽器裡，不會進 repo。

   合併方式不是「後蓋前」，而是逐筆比對時間戳：
   - prog（熟練度）：每個字各自比 at，新的贏
   - words（單字）：同上；刪掉的字用墓碑擋住，不會從另一台復活
   - quiz（測驗紀錄）：兩邊聯集，用時間去重
   所以手機和電腦各背各的，之後同步不會互相蓋掉。
*/

const GIST_FILE = "ielts-voc-progress.json";
const API = "https://api.github.com";

function syncCfg(){
  const s = loadDB().settings;
  return {token: (s.ghToken || "").trim(), gist: (s.gistId || "").trim(), at: s.syncAt || 0};
}
function syncReady(){ const c = syncCfg(); return !!(c.token && c.gist); }

async function gh(path, opts){
  const c = syncCfg();
  const res = await fetch(API + path, Object.assign({}, opts, {
    headers: Object.assign({
      "Authorization": "Bearer " + c.token,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28"
    }, (opts && opts.headers) || {})
  }));
  if (!res.ok){
    let msg = "HTTP " + res.status;
    try { const j = await res.json(); msg = j.message || msg; } catch(e){}
    if (res.status === 401) msg = "token 不正確或已過期";
    if (res.status === 404) msg = "找不到這個 gist（或 token 沒有 gist 權限）";
    throw new Error(msg);
  }
  return res.json();
}

/* 要同步的東西：進度、測驗紀錄、單字、牌組、墓碑。設定（含 token）不同步。 */
function syncPayload(){
  const db = loadDB();
  return {
    v: 1,
    device: deviceName(),
    at: Date.now(),
    seedVersion: db.seedVersion,
    decks: db.decks,
    words: db.words,
    prog: db.prog,
    quiz: db.quiz,
    gone: db.gone || {},
    goneDecks: db.goneDecks || {}
  };
}
function deviceName(){
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows";
  return "其他裝置";
}

/* 把遠端資料併進本機。回傳這次動到幾筆。 */
function mergeRemote(remote){
  if (!remote || typeof remote !== "object") return {prog:0, words:0, quiz:0};
  const db = loadDB();
  let nProg = 0, nWords = 0, nQuiz = 0;

  // 墓碑先合併：後面才知道哪些字已經被刪掉
  const gone = Object.assign({}, remote.gone || {}, db.gone || {});
  db.gone = gone;

  // 單字：以英文字為 key，比 at
  const byEn = new Map(db.words.map(w => [key(w.en), w]));
  (remote.words || []).forEach(rw => {
    const k = key(rw.en);
    if (!k || gone[k]) return;                       // 已刪除的不復活
    const mine = byEn.get(k);
    if (!mine){
      db.words.push(normalizeWord(rw));
      byEn.set(k, rw);
      nWords++;
    } else if ((rw.at || 0) > (mine.at || 0)){
      Object.assign(mine, normalizeWord(Object.assign({}, rw, {id: mine.id})));
      nWords++;
    }
  });
  // 本機有、但遠端已經刪掉的，也要跟著消失
  db.words = db.words.filter(w => !gone[key(w.en)]);
  Object.keys(db.prog).forEach(k => { if (gone[k]) delete db.prog[k]; });

  // 熟練度：每個字各自比 at，沒有 at 的舊資料就比 seen（練得多的算新）
  Object.entries(remote.prog || {}).forEach(([k, rp]) => {
    if (gone[k]) return;
    const mine = db.prog[k];
    const newer = !mine
      || (rp.at || 0) > (mine.at || 0)
      || (!rp.at && !mine.at && (rp.seen || 0) > (mine.seen || 0));
    if (newer){ db.prog[k] = rp; nProg++; }
  });

  // 牌組：以 id 聯集，但被刪掉的（墓碑）不加回來
  const goneDecks = Object.assign({}, remote.goneDecks || {}, db.goneDecks || {});
  db.goneDecks = goneDecks;
  db.decks = db.decks.filter(d => !goneDecks[d.id]);
  const deckIds = new Set(db.decks.map(d => d.id));
  (remote.decks || []).forEach(d => {
    if (goneDecks[d.id]) return;
    if (!deckIds.has(d.id)){ db.decks.push(d); deckIds.add(d.id); }
  });

  // 測驗紀錄：聯集去重，照時間排序，最多留 100 筆
  const seen = new Set(db.quiz.map(q => (q.ts || q.d) + "|" + q.mode + "|" + q.s + "/" + q.t));
  (remote.quiz || []).forEach(q => {
    const sig = (q.ts || q.d) + "|" + q.mode + "|" + q.s + "/" + q.t;
    if (!seen.has(sig)){ db.quiz.push(q); seen.add(sig); nQuiz++; }
  });
  db.quiz.sort((a, b) => (a.ts || 0) - (b.ts || 0) || String(a.d).localeCompare(String(b.d)));
  if (db.quiz.length > 100) db.quiz = db.quiz.slice(-100);

  db.seedVersion = Math.max(db.seedVersion || 0, remote.seedVersion || 0);
  saveDB(db);
  return {prog:nProg, words:nWords, quiz:nQuiz};
}

/* 建立一個新的 secret gist，回傳 id */
async function syncCreateGist(){
  const j = await gh("/gists", {
    method: "POST",
    body: JSON.stringify({
      description: "IELTS 單字本 — 學習進度（自動同步，請勿手動編輯）",
      public: false,
      files: {[GIST_FILE]: {content: JSON.stringify(syncPayload(), null, 1)}}
    })
  });
  setSetting("gistId", j.id);
  setSetting("syncAt", Date.now());
  return j.id;
}

async function pullRemote(){
  const c = syncCfg();
  const j = await gh("/gists/" + c.gist);
  const f = j.files && j.files[GIST_FILE];
  if (!f) return null;
  // 檔案太大時 GitHub 會截斷，改抓 raw_url
  const text = f.truncated ? await (await fetch(f.raw_url)).text() : f.content;
  try { return JSON.parse(text); } catch(e){ throw new Error("雲端資料壞掉了，可以按「重新上傳」覆蓋"); }
}

async function pushRemote(){
  const c = syncCfg();
  await gh("/gists/" + c.gist, {
    method: "PATCH",
    body: JSON.stringify({files: {[GIST_FILE]: {content: JSON.stringify(syncPayload(), null, 1)}}})
  });
  setSetting("syncAt", Date.now());
}

/* 一次完整同步：先拉下來合併，再把合併結果推上去 */
let _syncing = false;
async function syncNow(opts){
  opts = opts || {};
  if (!syncReady()) return {ok:false, msg:"還沒設定同步"};
  if (_syncing) return {ok:false, msg:"同步中"};
  _syncing = true;
  try {
    const remote = await pullRemote();
    const n = remote ? mergeRemote(remote) : {prog:0, words:0, quiz:0};
    await pushRemote();
    return {ok:true, merged:n, changed: n.prog + n.words + n.quiz > 0};
  } catch(e){
    return {ok:false, msg: e.message};
  } finally {
    _syncing = false;
  }
}

/* 只推不拉：測驗做完、離開頁面時用，比較快也不會把畫面資料換掉 */
async function syncPushQuiet(){
  if (!syncReady()) return;
  try { await pushRemote(); } catch(e){}
}

/* ---------- 設定碼：把 token 和 gist id 打包成一串，方便傳到另一台裝置 ---------- */
function syncCode(){
  const c = syncCfg();
  if (!c.token || !c.gist) return "";
  const raw = JSON.stringify({t: c.token, g: c.gist});
  return "VOC1." + btoa(unescape(encodeURIComponent(raw)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function applySyncCode(code){
  let s = String(code || "").trim().replace(/\s+/g, "");
  if (s.startsWith("VOC1.")) s = s.slice(5);
  const raw = decodeURIComponent(escape(atob(s.replace(/-/g, "+").replace(/_/g, "/"))));
  const o = JSON.parse(raw);
  if (!o.t || !o.g) throw new Error("這串設定碼不完整");
  setSetting("ghToken", o.t);
  setSetting("gistId", o.g);
}

/* ---------- 自動同步 ---------- */
// 進 App（首頁）時拉一次，離開時推一次。頁面切走也推，免得背到一半關掉沒存到雲端。
function autoSyncOnLeave(){
  if (!syncReady()) return;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") syncPushQuiet();
  });
  addEventListener("pagehide", syncPushQuiet);
}
