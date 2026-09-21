// 套用 /design 的設定到前台頁面：
//   data-t="key"   → 文字內容
//   data-tp="key"  → 輸入框提示字
// 網址加 ?preview 時，接受 /design 頁面用 postMessage 傳來的未儲存設定即時預覽
(function () {
  let D = window.__DESIGN__ || { vars: {}, texts: {}, customCss: '' };
  const original = {};
  document.querySelectorAll('[data-t]').forEach((el) => { original[el.dataset.t] = el.textContent; });
  document.querySelectorAll('[data-tp]').forEach((el) => { original[el.dataset.tp] = el.placeholder; });

  window.DESIGN_PREVIEW = new URLSearchParams(location.search).has('preview');

  // 取文字，{name} 之類的佔位符換成實際值
  window.T = function (key, vals) {
    let s = (D.texts && D.texts[key] != null) ? D.texts[key] : (original[key] ?? '');
    if (vals) s = s.replace(/[{]([A-Za-z0-9_]+)[}]/g, (m, k) => (vals[k] != null ? vals[k] : m));
    return s;
  };

  function applyTexts() {
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = window.T(el.dataset.t); });
    document.querySelectorAll('[data-tp]').forEach((el) => { el.placeholder = window.T(el.dataset.tp); });
  }
  function styleEl(id) {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('style'); el.id = id; document.head.appendChild(el); }
    return el;
  }
  // 預覽時的圖片：已上傳但未儲存的用 /uploads/，恢復預設的用 /brand/x?default
  function assetUrl(slot, v) {
    if (v === 'none') return '';
    if (v) return '/uploads/' + encodeURIComponent(v);
    return '/brand/' + slot + '?default';
  }
  function applyAssets() {
    const a = D.assets || {};
    document.querySelectorAll('img[data-asset]').forEach((img) => {
      const v = a[img.dataset.asset];
      img.hidden = v === 'none';
      if (v !== 'none') img.src = assetUrl(img.dataset.asset, v);
    });
  }
  function applyCss() {
    const clean = (v) => String(v ?? '').replace(/[;{}<>]/g, '').trim();
    const a = D.assets || {};
    const bg = a.bg === 'none' ? 'none' : 'url(' + assetUrl('bg', a.bg) + ')';
    styleEl('design-vars').textContent = ':root{' + Object.entries(D.vars || {}).map(([k, v]) => '--' + k + ':' + clean(v) + ';').join('') + '--bg-deco:' + bg + ';}';
    const custom = styleEl('design-custom');
    custom.textContent = String(D.customCss || '').replace(/</g, '');
    document.head.appendChild(custom); // 自訂 CSS 永遠放最後，優先權最高
  }

  applyTexts();

  if (window.DESIGN_PREVIEW) {
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data) return;
      if (e.data.type === 'design') {
        D = e.data.design;
        applyCss(); applyTexts(); applyAssets();
        document.dispatchEvent(new Event('designchange'));
      }
      if (e.data.type === 'view') document.dispatchEvent(new CustomEvent('previewview', { detail: e.data.view }));
    });
    if (window.parent !== window) window.parent.postMessage({ type: 'preview-ready' }, location.origin);
  }
})();
