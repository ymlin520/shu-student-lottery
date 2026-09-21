// 前台（報名頁 / 抽獎頁）可在 /design 調整的 CSS 變數、文字與圖片預設值
const vars = [
  // 配色（世新 70 週年在校生版：紅底＋亮金）
  { key: 'bg', group: '配色', label: '頁面底色（上）', type: 'color', default: '#6d0a10' },
  { key: 'bg2', group: '配色', label: '頁面底色（下）', type: 'color', default: '#4e0509' },
  { key: 'glow1', group: '配色', label: '中央紅光', type: 'color', default: '#c0161f' },
  { key: 'glow2', group: '配色', label: '右下紅光', type: 'color', default: '#8f0d14' },
  { key: 'card', group: '配色', label: '卡片底色', type: 'color', default: 'rgba(74, 6, 12, 0.62)' },
  { key: 'gold', group: '配色', label: '主色（按鈕、外框）', type: 'color', default: '#f2b93b' },
  { key: 'gold-hi', group: '配色', label: '亮金（標題、中獎姓名）', type: 'color', default: '#ffe08a' },
  { key: 'gold-lo', group: '配色', label: '按鈕陰影', type: 'color', default: '#9c6a10' },
  { key: 'btn-text', group: '配色', label: '按鈕文字', type: 'color', default: '#7a0c12' },
  { key: 'text', group: '配色', label: '主要文字', type: 'color', default: '#fbeed6' },
  { key: 'muted', group: '配色', label: '次要文字', type: 'color', default: '#e2bba3' },
  { key: 'danger', group: '配色', label: '警示顏色', type: 'color', default: '#ffd166' },
  { key: 'input-bg', group: '配色', label: '輸入框底色', type: 'color', default: 'rgba(40, 2, 6, 0.45)' },
  { key: 'accent', group: '配色', label: '身分識別色（標籤、浮水印）', type: 'color', default: '#4fd1ff' },
  { key: 'accent-text', group: '配色', label: '身分標籤文字', type: 'color', default: '#07233a' },
  // 抽獎機
  { key: 'ring-a', group: '抽獎機', label: '外環亮部', type: 'color', default: '#fff4d2' },
  { key: 'ring-b', group: '抽獎機', label: '外環主色', type: 'color', default: '#f2b93b' },
  { key: 'ring-c', group: '抽獎機', label: '外環暗部', type: 'color', default: '#9c6a10' },
  { key: 'drum-a', group: '抽獎機', label: '球槽中心', type: 'color', default: '#b3141c' },
  { key: 'drum-b', group: '抽獎機', label: '球槽邊緣', type: 'color', default: '#3e0205' },
  { key: 'ball-1', group: '抽獎機', label: '彩球 1（金）', type: 'color', default: '#f2b93b' },
  { key: 'ball-2', group: '抽獎機', label: '彩球 2（天藍）', type: 'color', default: '#5cc8ff' },
  { key: 'ball-3', group: '抽獎機', label: '彩球 3（珊瑚）', type: 'color', default: '#ff7a8a' },
  { key: 'ball-4', group: '抽獎機', label: '彩球 4（薄荷）', type: 'color', default: '#5fd6a7' },
  { key: 'ball-5', group: '抽獎機', label: '彩球 5（薰衣草）', type: 'color', default: '#b59cff' },
  { key: 'mix-speed', group: '抽獎機', label: '彩球轉速（0.1 很慢～1 正常）', type: 'text', default: '0.3' },
  { key: 'name-char-delay', group: '抽獎機', label: '姓名逐字出現間隔（毫秒）', type: 'text', default: '650' },
  { key: 'tray-ball', group: '抽獎機', label: '中獎球', type: 'color', default: '#ffd35c' },
  // 圖片與 Logo
  { key: 'logo-height', group: '圖片與 Logo', label: '左上角 Logo 高度', type: 'text', default: '48px' },
  { key: 'hub-logo-size', group: '圖片與 Logo', label: '抽獎機中心 Logo 大小', type: 'text', default: '74%' },
  { key: 'bg-deco-opacity', group: '圖片與 Logo', label: '背景裝飾圖透明度（0～1）', type: 'text', default: '0.9' },
  // 字型與尺寸
  { key: 'font', group: '字型與尺寸', label: '內文字型', type: 'text', default: '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif' },
  { key: 'font-display', group: '字型與尺寸', label: '標題字型（標題、中獎姓名）', type: 'text', default: '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif' },
  { key: 'radius', group: '字型與尺寸', label: '卡片圓角', type: 'text', default: '26px' },
  { key: 'btn-radius', group: '字型與尺寸', label: '按鈕圓角', type: 'text', default: '999px' },
  { key: 'reg-title-size', group: '字型與尺寸', label: '登記頁標題字級', type: 'text', default: 'clamp(28px, 5vw, 40px)' },
  { key: 'draw-title-size', group: '字型與尺寸', label: '抽獎頁標題字級', type: 'text', default: 'clamp(22px, 3vw, 34px)' },
  { key: 'winner-size', group: '字型與尺寸', label: '中獎姓名字級', type: 'text', default: 'clamp(110px, 17vw, 260px)' },
  { key: 'dept-size', group: '字型與尺寸', label: '中獎系所字級', type: 'text', default: 'clamp(30px, 4vw, 56px)' },
  { key: 'machine-size', group: '字型與尺寸', label: '抽獎機大小', type: 'text', default: 'min(33vh, 76vw, 440px)' },
];

const texts = [
  // 登入／報名頁
  { key: 'reg.brand', group: '報名頁', label: '左上角名稱', default: '世新大學 70 週年' },
  { key: 'reg.badge', group: '報名頁', label: '身分標籤（標題上方）', default: '在校生場　STUDENTS' },
  { key: 'reg.watermark', group: '報名頁', label: '背景浮水印（留空不顯示）', default: 'STUDENTS' },
  { key: 'reg.title', group: '報名頁', label: '大標題（也是瀏覽器分頁名稱）', default: '世新大學在校生抽獎活動' },
  { key: 'reg.intro', group: '報名頁', label: '標題下說明', multiline: true, default: `用學校帳號密碼登入，登入成功就完成報名。
每人限報名一次，祝你好運！` },
  { key: 'reg.formTitle', group: '報名頁', label: '表單標題', default: '學生登入' },
  { key: 'reg.formSub', group: '報名頁', label: '表單副標', default: '使用校園單一入口（SSO）帳號密碼' },
  { key: 'reg.account', group: '報名頁', label: '「學號／帳號」', default: '學號／校園帳號' },
  { key: 'reg.accountPh', group: '報名頁', label: '帳號欄提示字', default: '例：A1100123' },
  { key: 'reg.password', group: '報名頁', label: '「密碼」', default: '密碼' },
  { key: 'reg.passwordPh', group: '報名頁', label: '密碼欄提示字', default: '校園系統密碼' },
  { key: 'reg.submit', group: '報名頁', label: '登入按鈕', default: '登入並報名' },
  { key: 'reg.submitting', group: '報名頁', label: '登入中按鈕', default: '認證中…' },
  { key: 'reg.privacy', group: '報名頁', label: '個資說明', multiline: true, default: '登入僅向學校認證系統確認身分並取得姓名、系所，不會儲存你的密碼。資料僅用於本次抽獎活動。' },
  { key: 'reg.doneTitle', group: '報名頁', label: '完成畫面標題', default: '報名完成' },
  { key: 'reg.doneText', group: '報名頁', label: '完成畫面內容（{name} 換成姓名）', default: '{name} 同學，報名成功，祝你中大獎！' },
  { key: 'reg.doneNo', group: '報名頁', label: '報名編號（{no} 換成編號）', default: '報名編號 {no}' },
  { key: 'reg.againTitle', group: '報名頁', label: '重複登入標題', default: '你已經報名過了' },
  { key: 'reg.againText', group: '報名頁', label: '重複登入內容', default: '{name} 同學，你已經在抽獎名單內，不用重複報名。' },
  { key: 'reg.closedTitle', group: '報名頁', label: '截止畫面標題', default: '報名已截止' },
  { key: 'reg.closedText', group: '報名頁', label: '截止畫面內容', default: '本次活動已停止報名，感謝你的關注。' },
  // 抽獎頁
  { key: 'draw.brand', group: '抽獎頁', label: '左上角名稱', default: '世新大學 70 週年' },
  { key: 'draw.badge', group: '抽獎頁', label: '身分標籤（頂端中央）', default: '在校生場　STUDENTS' },
  { key: 'draw.watermark', group: '抽獎頁', label: '背景浮水印（留空不顯示）', default: 'STUDENTS' },
  { key: 'draw.heading', group: '抽獎頁', label: '大標題', default: '今天的幸運同學是誰？' },
  { key: 'draw.hub', group: '抽獎頁', label: '轉盤中心文字（預設顯示 logo，留空即可）', multiline: true, default: '' },
  { key: 'draw.button', group: '抽獎頁', label: '抽獎按鈕', default: '開始抽獎' },
  { key: 'draw.drawing', group: '抽獎頁', label: '抽獎中按鈕', default: '抽獎中…' },
  { key: 'draw.allDone', group: '抽獎頁', label: '抽完時按鈕', default: '全部抽完了' },
  { key: 'draw.congrats', group: '抽獎頁', label: '中獎標語', default: '恭喜抽中' },
  { key: 'draw.deptEmpty', group: '抽獎頁', label: '中獎者沒有系所時顯示', default: '（未提供系所）' },
  { key: 'draw.former', group: '抽獎頁', label: '（未使用）原名前綴', default: '原名' },
];

// 可在設計後台上傳替換的圖片（沒上傳就用 default）
const assets = [
  { key: 'logo', label: '左上角 Logo', hint: '登記頁、抽獎頁、後台左上角。建議透明背景 PNG／WebP，高度 200px 以上。', default: 'assets/logo-70-sm.webp', allowNone: true },
  { key: 'hub', label: '抽獎機中心 Logo', hint: '抽獎機中央的圓形區域，攪拌時會跟著轉。建議正方形、透明背景。選「不顯示」可改用「抽獎頁文字」裡的轉盤中心文字。', default: 'assets/logo-70-sm.webp', allowNone: true },
  { key: 'favicon', label: '瀏覽器分頁圖示', hint: '分頁標籤上的小圖示。建議正方形 PNG，128×128 以上。', default: 'assets/favicon.png', allowNone: false },
  { key: 'bg', label: '背景裝飾圖', hint: '整頁背景上的裝飾（目前是同心金圈與紅綢）。會鋪滿畫面，建議 1600×900 以上，或選「不顯示」只留底色。', default: 'assets/bg-deco.svg', allowNone: true },
];

module.exports = { vars, texts, assets };
