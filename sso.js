// SSO 認證模組
//
// 模式（改 sso-config.json 的 mode）：
//   shu  : 世新 SSO Web Service（ServSSO.asmx 的 SetUrlLog），可切測試機／正式機
//   mock : 測試模式，任何帳號密碼都會通過，回傳假資料
//   api  : 一般 JSON API（保留給其他學校／系統）
//
// 密碼只會即時轉送給認證系統，不寫入 db.json，也不寫進 log。
const fs = require('node:fs');
const path = require('node:path');

const CONFIG_FILE = path.join(__dirname, 'sso-config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch { return { mode: 'mock' }; }
}

function pick(obj, pathStr) {
  if (!pathStr) return '';
  return String(pathStr.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj) ?? '').trim();
}

// ---------- 世新 SSO（ServSSO.asmx / SetUrlLog）----------
// 回傳字串為逗號分隔，欄位順序見介接說明文件：
// 0 模糊身分證 1 姓名 2 性別 3 員工編號 4 學號 5 現職員工 6 在校生 7 第三類身分
// 8 是否老師 9 所屬單位 10 系所名稱 11 圖書館帳號 12 登入身分(1教職員/2學生)
// 13 登入員編或學號 14 Email 帳號（不含 @mail.shu.edu.tw）
const SHU_TEST_URL = 'https://netoffice.shu.edu.tw/WebApp/S/00/ServSSO.asmx';
const SHU_PROD_URL = 'https://ap0.shu.edu.tw/WebApp/S/00/ServSSO.asmx';

function unescapeXml(s) {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');
}

async function shuVerify(account, password, cfg) {
  const c = cfg.shu || {};
  const url = (c.url || (c.env === 'prod' ? SHU_PROD_URL : SHU_TEST_URL)).replace(/\/+$/, '');
  if (!c.id1 || !c.id2) return { ok: false, error: '尚未設定世新提供的廠商帳號密碼，請聯絡管理員。', detail: 'missing id1/id2' };

  const body = new URLSearchParams({ id1: c.id1, id2: c.id2, ip: '', sLog: account, sUrl: password });
  let text;
  try {
    const res = await fetch(url + '/SetUrlLog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8', Accept: 'text/xml' },
      body: body.toString(),
      signal: AbortSignal.timeout(c.timeoutMs || 15000),
    });
    const xml = await res.text();
    if (!res.ok) return { ok: false, error: '系統登入失敗，請稍後再試。', detail: 'HTTP ' + res.status };
    const m = xml.match(/<string[^>]*>([\s\S]*?)<\/string>/);
    text = unescapeXml(m ? m[1] : xml).trim();
  } catch (e) {
    return { ok: false, error: '無法連線到學校認證系統，請稍後再試。', detail: e.message };
  }

  if (!text) return { ok: false, error: '系統登入失敗，請稍後再試。', detail: '空回應' };
  if (/^Error\s*[:：]/i.test(text)) {
    // 世新回傳的錯誤訊息會附上使用者輸入的密碼原文，寫進 log 前一律遮掉
    text = text.replace(/密碼\s*[:：]\s*『[^』]*』/g, '密碼:『***』');
    if (password) text = text.split(password).join('***');
    // 『Error:』後面的訊息是給開發除錯用，不直接顯示給學生
    if (/廠商/.test(text)) return { ok: false, error: '系統設定有誤（廠商驗證未通過），請聯絡管理員。', detail: text, vendorError: true };
    return { ok: false, error: '系統登入失敗！請確認帳號與密碼。', detail: text };
  }

  const f = text.split(',').map((v) => v.trim());
  if (f.length < 15) return { ok: false, error: '系統登入失敗，請稍後再試。', detail: '欄位數不符：' + f.length };

  // 判斷在校生：第 13 欄「登入身分」＝ 2（學生）且第 7 欄「是否為在校生」＝ 1，兩者都要成立
  const loginAsStudent = f[12] === '2';     // 第 13 欄：登入身分（1 教職員、2 學生）
  const isStudent = f[6] === '1';           // 第 7 欄：是否為在校生
  const isStaff = f[5] === '1';             // 第 6 欄：是否為現職員工
  if (c.onlyCurrentStudent !== false && !(loginAsStudent && isStudent)) {
    // 以教職員身分登入但有在校學號的人，提示改用學號；其他人一律說明不是在校生
    const why = !loginAsStudent && isStudent && f[4] ? '請改用學號登入（目前是以教職員編號登入）。' : '你的帳號不是在校生身分。';
    return { ok: false, error: '本次抽獎限在校生參加，' + why, detail: `登入身分=${f[12]} 在校生=${f[6]} 教職員=${f[5]}` };
  }

  // 學號取第 14 欄「登入員工編號或學號」（登入身分為學生時就是學號）
  const studentNo = (f[13] || account).toUpperCase();
  const emailAcct = f[14] || '';
  return {
    ok: true,
    student: {
      studentNo,
      name: f[1],
      dept: f[10] || '',
      className: '',                         // 世新 SSO 沒有回傳班級
      email: emailAcct ? emailAcct + (c.emailDomain || '@mail.shu.edu.tw') : '',
      raw: c.keepRaw ? { fields: f } : undefined,
      flags: { isStudent, isStaff, isTeacher: f[8] === '1', loginType: f[12] },
    },
  };
}

// ---------- 測試模式 ----------
function mockVerify(account) {
  const tail = account.replace(/[^0-9]/g, '').slice(-3) || '001';
  const depts = ['新聞學系', '廣播電影電視學系', '資訊管理學系', '公共關係暨廣告學系', '數位多媒體設計學系'];
  return {
    ok: true,
    student: {
      studentNo: account.toUpperCase(),
      name: '測試學生' + tail,
      dept: depts[Number(tail) % depts.length],
      email: account.toLowerCase() + '@mail.shu.edu.tw',
      raw: { mock: true },
    },
  };
}

// ---------- 一般 JSON API ----------
async function apiVerify(account, password, cfg) {
  const a = cfg.api || {};
  if (!a.url) return { ok: false, error: '尚未設定 SSO API 網址，請聯絡管理員。' };
  const fill = (v) => String(v).replace('{account}', account).replace('{password}', password);
  const body = {};
  for (const [k, v] of Object.entries(a.bodyTemplate || { account: '{account}', password: '{password}' })) body[k] = fill(v);

  const headers = { Accept: 'application/json', ...(a.headers || {}) };
  let payload;
  if ((a.format || 'json') === 'form') {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(body).toString();
  } else {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res, data;
  try {
    res = await fetch(a.url, { method: a.method || 'POST', headers, body: payload, signal: AbortSignal.timeout(a.timeoutMs || 8000) });
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = { _text: text }; }
  } catch (e) {
    return { ok: false, error: '無法連線到學校認證系統，請稍後再試。', detail: e.message };
  }

  let ok = res.ok;
  if (ok && a.successPath) {
    const v = pick(data, a.successPath);
    ok = a.successValue != null ? v === String(a.successValue) : ['true', '1', 'Y', 'yes', 'success', 'OK'].includes(v);
  }
  if (!ok) return { ok: false, error: pick(data, a.errorPath) || '帳號或密碼錯誤，請再試一次。' };

  const map = a.map || {};
  const student = {
    studentNo: (pick(data, map.studentNo) || account).toUpperCase(),
    name: pick(data, map.name),
    dept: pick(data, map.dept),
    className: pick(data, map.className),
    email: pick(data, map.email),
    raw: a.keepRaw ? data : undefined,
  };
  if (!student.name) return { ok: false, error: '認證系統沒有回傳姓名，請聯絡管理員。' };
  return { ok: true, student };
}

async function verify(account, password) {
  const cfg = loadConfig();
  if (!account || !password) return { ok: false, error: '請輸入帳號與密碼。' };
  if (cfg.mode === 'shu') return shuVerify(account, password, cfg);
  if (cfg.mode === 'api') return apiVerify(account, password, cfg);
  return mockVerify(account);
}

const isMock = () => loadConfig().mode !== 'api' && loadConfig().mode !== 'shu';

// 給後台顯示目前介接狀態
function status() {
  const cfg = loadConfig();
  if (cfg.mode === 'shu') {
    const c = cfg.shu || {};
    const prod = c.env === 'prod';
    return {
      mock: false,
      mode: 'shu',
      label: '世新 SSO（' + (prod ? '正式機' : '測試機') + '）',
      url: c.url || (prod ? SHU_PROD_URL : SHU_TEST_URL),
      ready: !!(c.id1 && c.id2),
      test: !prod,
    };
  }
  if (cfg.mode === 'api') return { mock: false, mode: 'api', label: '自訂 API', url: (cfg.api || {}).url, ready: !!(cfg.api || {}).url, test: false };
  return { mock: true, mode: 'mock', label: '測試模式（任何帳密都會通過）', ready: true, test: true };
}

module.exports = { verify, isMock, status, loadConfig, SHU_TEST_URL, SHU_PROD_URL };
