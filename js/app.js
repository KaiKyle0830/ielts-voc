/* 我的單字本 — 共用資料層與工具 */
const $  = (s, el=document) => el.querySelector(s);
const $$ = (s, el=document) => [...el.querySelectorAll(s)];

const STORE_KEY = "myVocabApp";

/* ---------- 資料結構 ----------
DB = {
  v: 1,
  seedVersion: 0,                       // 已經吃進來的 data/seed.js 版本
  decks:  [{id, name, icon}],
  words:  [{id, deck, en, pos, zh, ex, exZh, note, added}],
  prog:   { "<en 小寫>": {box, due, seen, right, wrong, last} },
  quiz:   [{d, mode, s, t, deck}],
  settings: {}
}
------------------------------------- */

const DEFAULT_DB = { v:1, seedVersion:0, decks:[], words:[], prog:{}, quiz:[], settings:{} };

function loadDB(){
  let db;
  try { db = JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch(e){ db = null; }
  db = Object.assign({}, DEFAULT_DB, db || {});
  db.decks = db.decks || []; db.words = db.words || [];
  db.prog = db.prog || {};   db.quiz  = db.quiz  || [];
  db.settings = db.settings || {};
  return db;
}
function saveDB(db){ localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
function setSetting(k, v){
  const db = loadDB();
  db.settings[k] = v;
  saveDB(db);
}

/* 第一次開啟（或 seed 檔更新）時，把 data/seed.js 的單字併進來 */
function syncSeed(){
  const seed = window.SEED_WORDS || [];
  const ver  = window.SEED_VERSION || 0;
  const db = loadDB();
  if (!db.decks.length) db.decks = [{id:"my", name:"我的單字", icon:"📘"}];
  if (ver <= db.seedVersion) return db;
  const have = new Set(db.words.map(w => key(w.en)));
  let added = 0;
  seed.forEach(w => {
    if (have.has(key(w.en))) return;
    db.words.push(normalizeWord(w));
    have.add(key(w.en));
    added++;
  });
  // seed 帶進來的牌組也要建好
  seed.forEach(w => {
    const id = w.deck || "my";
    if (!db.decks.some(d => d.id === id))
      db.decks.push({id, name: w.deckName || id, icon: w.deckIcon || "📗"});
  });
  db.seedVersion = ver;
  saveDB(db);
  return db;
}

function key(en){ return String(en || "").trim().toLowerCase(); }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }

function normalizeWord(w){
  return {
    id:    w.id || uid(),
    deck:  w.deck || "my",
    en:    String(w.en || "").trim(),
    pos:   String(w.pos || "").trim(),
    zh:    String(w.zh || "").trim(),
    ex:    String(w.ex || "").trim(),
    exZh:  String(w.exZh || "").trim(),
    note:  String(w.note || "").trim(),
    added: w.added || new Date().toISOString().slice(0,10)
  };
}

/* ---------- 單字 CRUD ---------- */
function allWords(){ return loadDB().words; }
function deckWords(deckId){
  const ws = allWords();
  return (!deckId || deckId === "all") ? ws : ws.filter(w => w.deck === deckId);
}
function allDecks(){ return loadDB().decks; }
function findDeck(id){ return allDecks().find(d => d.id === id) || null; }

function addDeck(name, icon){
  const db = loadDB();
  const id = "d" + uid();
  db.decks.push({id, name: name || "新牌組", icon: icon || "📗"});
  saveDB(db);
  return id;
}
function renameDeck(id, name, icon){
  const db = loadDB();
  const d = db.decks.find(x => x.id === id);
  if (!d) return;
  if (name) d.name = name;
  if (icon) d.icon = icon;
  saveDB(db);
}
function deleteDeck(id){
  const db = loadDB();
  db.decks = db.decks.filter(d => d.id !== id);
  db.words = db.words.filter(w => w.deck !== id);
  saveDB(db);
}

/* 匯入一批單字；同一個英文字已存在就更新內容（不動學習進度）。
   回傳 {added, updated} */
function importWords(list, deckId){
  const db = loadDB();
  const idx = new Map(db.words.map(w => [key(w.en), w]));
  let added = 0, updated = 0;
  list.forEach(raw => {
    const w = normalizeWord(Object.assign({}, raw, {deck: deckId || raw.deck || "my"}));
    if (!w.en) return;
    const old = idx.get(key(w.en));
    if (old){
      Object.assign(old, {pos:w.pos||old.pos, zh:w.zh||old.zh, ex:w.ex||old.ex,
                          exZh:w.exZh||old.exZh, note:w.note||old.note, deck:w.deck});
      updated++;
    } else {
      db.words.push(w); idx.set(key(w.en), w); added++;
    }
  });
  saveDB(db);
  return {added, updated};
}
function updateWord(id, patch){
  const db = loadDB();
  const w = db.words.find(x => x.id === id);
  if (!w) return;
  Object.assign(w, patch);
  saveDB(db);
}
function deleteWord(id){
  const db = loadDB();
  const w = db.words.find(x => x.id === id);
  db.words = db.words.filter(x => x.id !== id);
  if (w) delete db.prog[key(w.en)];
  saveDB(db);
}

/* ---------- 間隔複習（Leitner）---------- */
const BOX_DAYS = [0, 1, 2, 4, 8, 16];      // box 0 = 新字／今天再看一次
const MAX_BOX  = BOX_DAYS.length - 1;

/* 全部時間都用台灣時間（UTC+8），出國讀書時「今天」的定義才不會跟著跳。 */
const TZ_MIN = 8 * 60;
function twNow(t){
  const d = t ? new Date(t) : new Date();
  return new Date(d.getTime() + (TZ_MIN + d.getTimezoneOffset()) * 60000);
}
const p2 = n => String(n).padStart(2, "0");
function ymd(d){ return d.getFullYear() + "-" + p2(d.getMonth()+1) + "-" + p2(d.getDate()); }
function hm(d){ return p2(d.getHours()) + ":" + p2(d.getMinutes()); }

function today(){ return ymd(twNow()); }
function addDays(n){
  const d = twNow();
  d.setDate(d.getDate() + n);
  return ymd(d);
}
/* 顯示用：一筆測驗紀錄的台灣時間。ts 是新格式，舊紀錄的 d 是 UTC 字串。 */
function stampOf(r){
  if (r.ts) return ymd(twNow(r.ts)) + " " + hm(twNow(r.ts));
  const d = twNow(new Date(String(r.d).slice(0,16) + ":00Z").getTime());
  return isNaN(d) ? String(r.d).replace("T", " ") : ymd(d) + " " + hm(d);
}
function getProg(en){
  const p = loadDB().prog[key(en)];
  return p || {box:0, due:today(), seen:0, right:0, wrong:0, last:""};
}
/* grade: 2 = 記得、1 = 有點模糊、0 = 不認識 */
function grade(en, g){
  const db = loadDB();
  const k = key(en);
  const p = db.prog[k] || {box:0, due:today(), seen:0, right:0, wrong:0, last:""};
  p.seen++;
  if (g >= 2){ p.box = Math.min(MAX_BOX, p.box + 1); p.right++; }
  else if (g === 1){ p.box = Math.max(1, p.box); p.right++; }
  else { p.box = 0; p.wrong++; }
  p.due  = addDays(BOX_DAYS[p.box]);
  p.last = today();
  db.prog[k] = p;
  saveDB(db);
}
function isDue(w){
  const p = getProg(w.en);
  return p.due <= today();
}
function isNew(w){ return !loadDB().prog[key(w.en)]; }
function isLearned(w){
  const p = loadDB().prog[key(w.en)];
  return !!p && p.box >= 3;
}
/* 今天該複習的字：到期的排前面，新字排後面 */
function dueWords(deckId){
  const db = loadDB();
  const t = today();
  const ws = deckWords(deckId);
  const seen = [], fresh = [];
  ws.forEach(w => {
    const p = db.prog[key(w.en)];
    if (!p) fresh.push(w);
    else if (p.due <= t) seen.push({w, box:p.box, due:p.due});
  });
  seen.sort((a,b) => a.box - b.box || String(a.due).localeCompare(String(b.due)));
  return seen.map(x => x.w).concat(fresh);
}
function deckStats(deckId){
  const db = loadDB();
  const t = today();
  const ws = deckWords(deckId);
  let neu = 0, due = 0, learned = 0;
  ws.forEach(w => {
    const p = db.prog[key(w.en)];
    if (!p){ neu++; return; }
    if (p.due <= t) due++;
    if (p.box >= 3) learned++;
  });
  return {total: ws.length, neu, due, learned};
}

/* ---------- 測驗紀錄 ---------- */
function addQuizResult(mode, s, t, deck){
  const db = loadDB();
  const now = twNow();
  db.quiz.push({d: ymd(now) + "T" + hm(now), ts: Date.now(), mode, s, t, deck: deck || "all"});
  if (db.quiz.length > 100) db.quiz = db.quiz.slice(-100);
  saveDB(db);
}
function quizHistory(){ return loadDB().quiz; }

/* 連續學習天數 */
function streak(){
  const db = loadDB();
  const days = new Set();
  Object.values(db.prog).forEach(p => { if (p.last) days.add(p.last); });
  db.quiz.forEach(q => days.add(String(q.d).slice(0,10)));
  let n = 0;
  for (let i = 0; ; i++){
    const d = twNow(); d.setDate(d.getDate() - i);
    if (days.has(ymd(d))) n++;
    else if (i > 0) break;          // 今天還沒學不算斷
  }
  return n;
}

/* ---------- 錯題 ----------
   答錯過、而且還沒練熟（box < 3）的字。錯越多次、box 越低的排越前面。 */
function wrongWords(deckId){
  const db = loadDB();
  return deckWords(deckId)
    .map(w => ({w, p: db.prog[key(w.en)]}))
    .filter(x => x.p && x.p.wrong > 0 && x.p.box < 3)
    .sort((a, b) => a.p.box - b.p.box
                 || b.p.wrong - a.p.wrong
                 || String(b.p.last).localeCompare(String(a.p.last)))
    .map(x => x.w);
}
function wrongCount(deckId){ return wrongWords(deckId).length; }

/* ---------- 工具 ---------- */
function shuffle(arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function sampleN(arr, n){ return shuffle(arr).slice(0, Math.min(n, arr.length)); }
function qs(name){ return new URLSearchParams(location.search).get(name); }
function esc(s){ const d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

/* 例句挖空：把目標單字換成底線，順便吃掉 -s/-ed/-ing 等變化。
   只在有詞邊界時才挖，免得 act 把 action 挖成「＿＿＿ion」。 */
function blankOut(ex, en){
  if (!ex || !en) return ex || "";
  const w = en.trim();
  const q = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 片語就整串比對，中間允許多個空白
  if (/\s/.test(w)){
    return ex.replace(new RegExp("\\b" + q(w).replace(/\s+/g, "\\s+") + "\\b", "i"), "＿＿＿");
  }
  const pats = [q(w) + "(?:s|es|ed|d|ing|ly)?"];
  if (/e$/i.test(w))          pats.push(q(w.slice(0, -1)) + "(?:ing|ed)");      // make → making
  if (/y$/i.test(w))          pats.push(q(w.slice(0, -1)) + "(?:ies|ied)");     // carry → carried
  if (/[b-df-hj-np-tv-z]$/i.test(w)) pats.push(q(w + w.slice(-1)) + "(?:ing|ed)"); // stop → stopping
  return ex.replace(new RegExp("\\b(?:" + pats.join("|") + ")\\b", "i"), "＿＿＿");
}
function hasBlank(ex, en){ return blankOut(ex, en) !== ex; }

function toast(msg, ms){
  let t = $(".toast");
  if (!t){ t = document.createElement("div"); t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg;
  requestAnimationFrame(() => t.classList.add("show"));
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms || 1800);
}
async function copyText(text){
  try { await navigator.clipboard.writeText(text); return true; }
  catch(e){
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch(e2){}
    ta.remove();
    return ok;
  }
}

/* ---------- 發音 ----------
   優先播 audio/ 底下事先合成好的 mp3（gen/generate_audio.py 產生，微軟神經語音），
   每支手機聽起來都一樣；沒有現成音檔的字才退回瀏覽器內建語音。 */

// 和 gen/seedlib.py 的 key_of() 是同一套雜湊（FNV-1a 32-bit）
function audioKey(text){
  const bytes = new TextEncoder().encode(String(text || "").replace(/\s+/g, " ").trim());
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i++) h = Math.imul(h ^ bytes[i], 16777619) >>> 0;
  return h.toString(16).padStart(8, "0");
}
// data/audio.js 把所有 key 接成一長串，每 8 個字元一個
let _audioKeys = null;
function hasAudio(key){
  if (!_audioKeys){
    const s = window.AUDIO_KEYS || "";
    _audioKeys = new Set();
    for (let i = 0; i + 8 <= s.length; i += 8) _audioKeys.add(s.substr(i, 8));
  }
  return _audioKeys.has(key);
}
// 沒網路或想省流量時可以切回內建語音
function useBuiltinVoice(){ return !!loadDB().settings.builtinVoice; }
function setBuiltinVoice(on){ setSetting("builtinVoice", !!on); }

let _voice = null;
function pickVoice(){
  if (!("speechSynthesis" in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith("en"));
  const score = v => {
    const n = v.name;
    if (/Natural|Neural/i.test(n)) return 5;
    if (/^Google/.test(n)) return 4;
    if (/Enhanced|Premium|Siri/i.test(n)) return 3;
    if (/Samantha|Ava|Allison|Karen|Serena/.test(n)) return 2;
    return 1;
  };
  const us = vs.filter(v => /en[-_]US/i.test(v.lang));
  _voice = (us.length ? us : vs).sort((a,b) => score(b) - score(a))[0] || null;
}
if ("speechSynthesis" in window){
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}
function ttsSpeak(text){
  if (!("speechSynthesis" in window) || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(String(text));
  u.lang = "en-US";
  u.rate = 1;
  if (_voice) u.voice = _voice;
  speechSynthesis.speak(u);
}

let _player = null;
function stopSpeaking(){
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  if (_player){ _player.pause(); _player = null; }
}
function speak(text){
  if (!text) return;
  stopSpeaking();
  const key = audioKey(text);
  if (useBuiltinVoice() || !hasAudio(key)){ ttsSpeak(text); return; }
  const a = new Audio("audio/" + key + ".mp3");
  _player = a;
  // 音檔壞掉或被擋下來就改用內建語音，不能讓它沒聲音
  const fallback = () => { if (_player === a){ _player = null; ttsSpeak(text); } };
  a.onerror = fallback;
  const p = a.play();
  if (p && p.catch) p.catch(fallback);
}

/* ---------- 備份 ---------- */
function exportBackup(){
  return JSON.stringify(loadDB(), null, 2);
}
function importBackup(text){
  const db = JSON.parse(text);
  if (!db || !Array.isArray(db.words)) throw new Error("格式不對");
  saveDB(Object.assign({}, DEFAULT_DB, db));
}

/* ---------- 目前選的牌組 ---------- */
function curDeck(){
  const q = qs("deck");
  if (q) return q;
  const d = loadDB().settings.deck;
  return d && (d === "all" || findDeck(d)) ? d : "all";
}
function setCurDeck(id){
  const db = loadDB();
  db.settings.deck = id;
  saveDB(db);
}
function deckLabel(id){
  if (!id || id === "all") return "全部單字";
  const d = findDeck(id);
  return d ? `${d.icon} ${d.name}` : "全部單字";
}
function deckParam(id){ return id && id !== "all" ? `?deck=${encodeURIComponent(id)}` : ""; }
