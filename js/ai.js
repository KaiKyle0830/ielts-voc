/* 產生字卡內容：出題指令、JSON 解析、直接呼叫 Claude API（可選） */

const AI_MODELS = [
  {id:"claude-opus-5",   name:"Opus 5（最聰明，例句最自然）"},
  {id:"claude-sonnet-5", name:"Sonnet 5（快、便宜）"},
  {id:"claude-haiku-4-5",name:"Haiku 4.5（最便宜）"}
];

/* 把使用者貼的一大段字整理成清單。
   一行一個字，允許「word 中文」或「word - 中文」，也允許用逗號分隔。 */
function parseInputWords(text){
  const out = [];
  const seen = new Set();
  String(text || "")
    .split(/[\n\r]+/)
    .flatMap(line => line.includes(",") && !/[一-鿿]/.test(line) ? line.split(",") : [line])
    .forEach(line => {
      let s = line.trim().replace(/^[\d]+[.、)\s]+/, "");     // 去掉「1. 」這類編號
      if (!s) return;
      const m = s.match(/^([A-Za-z][A-Za-z'’\- ]*?)\s*(?:[-–—:：]\s*|\s+)([一-鿿].*)$/);
      let en = s, hint = "";
      if (m){ en = m[1].trim(); hint = m[2].trim(); }
      en = en.replace(/[.,;]+$/, "").trim();
      if (!/^[A-Za-z][A-Za-z'’\- ]*$/.test(en)) return;        // 不是英文就跳過
      const k = en.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push({en, hint});
    });
  return out;
}

const AI_SYSTEM =
`你是英文單字卡製作助手，服務對象是台灣的英語學習者。
為每個單字產生：
- pos：詞性縮寫（n. / v. / adj. / adv. / prep. / conj. / pron. / phr.），多詞性只寫最常用的
- zh：繁體中文意思，取最常用的一到兩個，用「；」分隔，不要加詞性
- ex：一個英文例句，8～16 個字，日常實用、句意能看出這個字的意思，句中必須實際出現這個單字（可用時態或單複數變化）
- exZh：例句的繁體中文翻譯，自然通順
- note：一句話的用法提示、常見搭配或易混淆字；沒特別可講就給空字串

規則：
- 只輸出 JSON 陣列，不要任何說明文字，不要 markdown 圍欄
- 順序與收到的單字一致，每個單字一筆
- 使用者若在單字後面附了中文，以他給的意思為準
- 用繁體中文與台灣用語`;

function buildPrompt(items){
  const list = items.map(w => w.hint ? `${w.en}（${w.hint}）` : w.en).join("\n");
  return AI_SYSTEM + `

輸出格式：
[{"en":"...","pos":"...","zh":"...","ex":"...","exZh":"...","note":"..."}]

單字：
` + list;
}

/* 容錯解析：吃得下 ```json 圍欄、前後多餘說明 */
function parseWordsJSON(text){
  let s = String(text || "").trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  if (s[0] !== "["){
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  }
  const data = JSON.parse(s);
  if (!Array.isArray(data)) throw new Error("不是陣列");
  return data.filter(w => w && w.en).map(w => ({
    en: String(w.en).trim(),
    pos: String(w.pos || "").trim(),
    zh: String(w.zh || "").trim(),
    ex: String(w.ex || "").trim(),
    exZh: String(w.exZh || w.ex_zh || "").trim(),
    note: String(w.note || "").trim()
  }));
}

/* ---------- 直接呼叫 Claude API（設定頁填了 API key 才會用到）---------- */
function getApiKey(){ return (loadDB().settings.apiKey || "").trim(); }
function getModel(){ return loadDB().settings.model || AI_MODELS[0].id; }

async function generateWithAPI(items){
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("還沒設定 API key");
  const list = items.map(w => w.hint ? `${w.en}（${w.hint}）` : w.en).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      // 允許網頁直接呼叫（key 只存在這台裝置的瀏覽器裡）
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: getModel(),
      max_tokens: 16000,
      system: AI_SYSTEM,
      output_config: {effort: "low"},
      messages: [{role:"user", content:
        `輸出格式：\n[{"en":"...","pos":"...","zh":"...","ex":"...","exZh":"...","note":"..."}]\n\n單字：\n` + list}]
    })
  });
  if (!res.ok){
    let msg = "HTTP " + res.status;
    try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch(e){}
    if (res.status === 401) msg = "API key 不正確";
    throw new Error(msg);
  }
  const data = await res.json();
  // adaptive thinking 會夾帶 thinking block，只取 text
  const text = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
  if (!text) throw new Error("模型沒有回傳內容");
  return parseWordsJSON(text);
}
