// 抽獎畫面的背景音樂與音效：全部用 Web Audio 即時合成，沒有任何音檔或取樣，
// 旋律、節奏、音色都是這支程式自己產生的原創內容，沒有著作權問題。
//
// 運作方式：一條固定拍速（預設 128 BPM）的節拍軸，從第一次點擊／按鍵開始一直走。
// 抽獎流程把每個階段（phase）排在拍點上，畫面動作也由同一條節拍軸發出的事件觸發，
// 所以聲音和畫面永遠對拍。
//
//   idle       待機律動（悶一點、輕一點），中獎後也回到這裡
//   intro      開場彈跳：節奏一路加溫，球每次落地踩在拍點上
//   mix        攪拌：全開的電子舞曲律動，彩球跟著大鼓跳
//   build      減速：小鼓滾奏越來越密、上升音效，緊張感拉滿
//   out        中獎球滾出：音樂抽空，只剩心跳、時鐘滴答與張力長音
//   dept       系所揭曉：重擊後鼓聲滾奏一路推到姓名
//   surname    姓出現後：低音一拍一拍往上爬，等名字
//   chars      名字逐字砸下：每個字一記重擊
//   celebrate  最後一個字：勝利號角＋全開慶祝律動，32 小節後回到 idle
(function () {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx = null, comp = null, master = null, lp = null, drumBus = null, padBus = null, fxBus = null, gtrIn = null, verbSend = null, noise = null;
  let bpm = 128, spb = 60 / bpm;   // 每拍幾秒（依風格與速度設定）
  let t0 = 0;                       // 第 0 拍的 performance 時間（秒）
  let running = false, timer = 0, nextStep = 0;
  let muted = false, volume = 0.8;
  let live = false;                 // 這一步要不要真的出聲（靜音或分頁在背景時只跑畫面事件）
  let phases = [];                  // { name, start（第幾個 16 分音符）, len（16 分音符數，0＝不限）, next }
  let shots = [];                   // 單發音效 { step, name, arg }
  const listeners = {};

  const nowSec = () => performance.now() / 1000;
  const S16 = () => spb / 4;
  const stepTime = (s) => t0 + s * S16();
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- 音訊路由 ----------
  function build() {
    if (ctx || !AC) return;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch { try { ctx = new AC(); } catch { ctx = null; return; } }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = muted ? 0 : volume;
    comp.connect(master).connect(ctx.destination);
    // 樂器（鼓、貝斯、和弦）走 lp：待機時把高頻收掉，聽起來像隔著一道牆的派對
    lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.8;
    lp.connect(comp);
    drumBus = ctx.createGain(); drumBus.connect(lp);
    padBus = ctx.createGain(); padBus.connect(lp);        // 大鼓打下去時會被「壓」一下，做出抽吸的律動感
    fxBus = ctx.createGain(); fxBus.connect(comp);        // 重擊、號角這些特效不經過 lp，永遠清楚
    // 電吉他失真：tanh 曲線把波形削平，再用低通把刺耳的高頻收掉
    gtrIn = ctx.createGain();
    const shaper = ctx.createWaveShaper(), curve = new Float32Array(2048);
    for (let i = 0; i < curve.length; i++) { const x = i / (curve.length - 1) * 2 - 1; curve[i] = Math.tanh(x * 12); }
    shaper.curve = curve; shaper.oversample = '2x';
    const gtone = ctx.createBiquadFilter(); gtone.type = 'lowpass'; gtone.frequency.value = 3600;
    const gout = ctx.createGain(); gout.gain.value = 0.22;
    gtrIn.connect(shaper).connect(gtone).connect(gout).connect(padBus);
    // 殘響：用衰減的雜訊自己做脈衝響應
    const verb = ctx.createConvolver();
    const len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    verbSend = ctx.createGain(); verbSend.gain.value = 0.32;
    verbSend.connect(verb).connect(comp);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  // performance 時間 → AudioContext 時間（用實際輸出時間對齊，聲音和畫面才不會差一截）
  function audioOffset() {
    if (ctx.getOutputTimestamp) {
      const ts = ctx.getOutputTimestamp();
      if (ts && ts.performanceTime) return ts.performanceTime / 1000 - ts.contextTime;
    }
    return nowSec() - ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }

  // ---------- 音色 ----------
  function gainEnv(t, peak, attack, decay) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  function send(node, amt) { if (amt > 0) { const s = ctx.createGain(); s.gain.value = amt; node.connect(s).connect(verbSend); } }
  function noiseHit(t, { type = 'highpass', f = 6000, fEnd = 0, q = 0.8, dur = 0.05, v = 0.3, attack = 0.001, dest = drumBus, rev = 0 }) {
    if (!live) return;
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (fEnd) fl.frequency.exponentialRampToValueAtTime(fEnd, t + attack + dur);
    const g = gainEnv(t, v, attack, dur);
    s.connect(fl).connect(g).connect(dest); send(g, rev);
    s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
  }
  function duck(t, depth = 0.3) {
    if (!live) return;
    padBus.gain.cancelScheduledValues(t);
    padBus.gain.setValueAtTime(depth, t);
    padBus.gain.linearRampToValueAtTime(1, t + spb * 0.55);
  }
  function kick(t, v = 1, pump = false) {
    if (!live) return;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(170, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.1);
    o.frequency.exponentialRampToValueAtTime(38, t + 0.4);
    const g = gainEnv(t, v, 0.003, 0.42);
    o.connect(g).connect(drumBus); o.start(t); o.stop(t + 0.5);
    noiseHit(t, { f: 2500, dur: 0.012, v: v * 0.22 });
    if (pump) duck(t);
  }
  function snare(t, v = 0.6) {
    if (!live) return;
    noiseHit(t, { type: 'bandpass', f: 1900, q: 0.7, dur: 0.17, v: v * 0.8, rev: 0.12 });
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(200, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.1);
    const g = gainEnv(t, v * 0.35, 0.002, 0.1); o.connect(g).connect(drumBus); o.start(t); o.stop(t + 0.15);
  }
  function clap(t, v = 0.6) {
    for (const d of [0, 0.011, 0.022]) noiseHit(t + d, { type: 'bandpass', f: 1250, q: 1.1, dur: 0.025, v: v * 0.7 });
    noiseHit(t + 0.03, { type: 'bandpass', f: 1250, q: 1.1, dur: 0.2, v: v * 0.55, rev: 0.3 });
  }
  const hat = (t, v = 0.1, open = false) => noiseHit(t, { f: 8200, dur: open ? 0.26 : 0.04, v });
  const tick = (t, v = 0.08) => noiseHit(t, { type: 'bandpass', f: 9000, q: 4, dur: 0.02, v });
  function crash(t, v = 0.5) {
    noiseHit(t, { f: 3800, dur: 1.9, v: v * 0.55, dest: fxBus, rev: 0.4 });
    noiseHit(t, { type: 'bandpass', f: 6500, q: 0.6, dur: 1.1, v: v * 0.3, dest: fxBus });
  }
  function boom(t, v = 0.8) {
    if (!live) return; // 電影預告片式的低頻重擊
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.3);
    const g = gainEnv(t, v, 0.004, 1.5); o.connect(g).connect(fxBus); o.start(t); o.stop(t + 1.6);
    noiseHit(t, { type: 'lowpass', f: 600, fEnd: 80, dur: 0.6, v: v * 0.5, dest: fxBus, rev: 0.3 });
  }
  function tom(t, f, v = 0.6) {
    if (!live) return;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.3);
    const g = gainEnv(t, v, 0.002, 0.35); o.connect(g).connect(fxBus); send(g, 0.2); o.start(t); o.stop(t + 0.4);
  }
  function heart(t, v = 0.8) {
    if (!live) return; // 心跳：悶悶的低音
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(75, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.16);
    const g = gainEnv(t, v, 0.006, 0.28); o.connect(g).connect(fxBus); o.start(t); o.stop(t + 0.35);
  }
  // 反向鈸：從小聲一路吸上來，剛好在下一拍「砰」之前收掉
  function swell(t, dur, v = 0.25) {
    if (!live) return;
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'highpass';
    fl.frequency.setValueAtTime(1500, t); fl.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur - 0.01); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(fxBus); send(g, 0.3);
    s.start(t, Math.random()); s.stop(t + dur + 0.02);
  }
  // 上升音效：雜訊掃頻＋音高往上滑的鋸齒波，鋪滿整段 dur
  function riser(t, dur, v = 0.3) {
    if (!live) return;
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 2.5;
    fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(7500, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + dur - 0.02); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(fl).connect(g).connect(fxBus); send(g, 0.25);
    s.start(t, 0); s.stop(t + dur + 0.05);
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + dur);
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 2400;
    const g2 = ctx.createGain(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(v * 0.18, t + dur - 0.02); g2.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f2).connect(g2).connect(fxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  // 通用合成器聲部：幾個微微走音的振盪器疊在一起（比較厚），經過有包絡的低通濾波
  function voice(t, midi, dur, { type = 'sawtooth', detune = [-8, 8], v = 0.1, a = 0.005, r = 0.12, c0 = 3000, c1 = 0, c2 = 0, ca = 0.05, q = 1, dest = padBus, rev = 0 } = {}) {
    if (!live) return;
    const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = q;
    fl.frequency.setValueAtTime(c0, t);
    if (c1) fl.frequency.exponentialRampToValueAtTime(c1, t + ca);
    if (c2) fl.frequency.exponentialRampToValueAtTime(c2, t + dur + r);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + Math.max(dur, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a) + r);
    fl.connect(g).connect(dest); send(g, rev);
    const per = 1 / Math.sqrt(detune.length);
    for (const dt of detune) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = mtof(midi); o.detune.value = dt;
      const og = ctx.createGain(); og.gain.value = per;
      o.connect(og).connect(fl); o.start(t); o.stop(t + Math.max(dur, a) + r + 0.05);
    }
  }
  function bass(t, midi, dur, v = 0.4) {
    voice(t, midi, dur, { detune: [0], v: v * 0.55, a: 0.004, r: 0.06, c0: 1400, c2: 220 });
    voice(t, midi - 12, dur, { type: 'sine', detune: [0], v: v * 0.75, a: 0.004, r: 0.06, c0: 400 });
  }
  const pluck = (t, midi, v = 0.08) => voice(t, midi, 0.05, { type: 'square', detune: [-6, 6], v, a: 0.002, r: 0.16, c0: 5200, c2: 700, rev: 0.25 });
  const pad = (t, notes, dur, v = 0.07) => notes.forEach((m) => voice(t, m, dur, { detune: [-12, 0, 12], v, a: 0.3, r: 0.6, c0: 1500, rev: 0.35 }));
  const stab = (t, notes, v = 0.3) => notes.forEach((m) => voice(t, m, 0.12, { detune: [-14, 0, 14], v: v / notes.length * 1.6, a: 0.003, r: 0.35, c0: 6000, c2: 600, dest: fxBus, rev: 0.45 }));
  const brass = (t, notes, dur, v = 0.3) => notes.forEach((m) => voice(t, m, dur, { detune: [-9, 0, 9], v: v / notes.length * 1.6, a: 0.025, r: 0.5, c0: 500, c1: 3800, ca: 0.07, c2: 1400, q: 2, dest: fxBus, rev: 0.4 }));
  // 張力長音：低音持續音＋高音顫音弦
  function drone(t, dur, v = 0.08) {
    if (!live) return;
    voice(t, 33, dur, { detune: [-5, 5], v: v * 1.4, a: 0.4, r: 0.4, c0: 260, dest: fxBus });
    const lfo = ctx.createOscillator(), depth = ctx.createGain(), trem = ctx.createGain();
    lfo.frequency.value = 7.5; depth.gain.value = 0.5; trem.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain); trem.connect(fxBus);
    for (const m of [69, 76, 81]) voice(t, m, dur, { detune: [-7, 7], v: v * 0.5, a: 0.6, r: 0.4, c0: 2600, dest: trem, rev: 0.3 });
    lfo.start(t); lfo.stop(t + dur + 0.5);
  }
  function lpTo(t, f) {
    if (!live) return; lp.frequency.cancelScheduledValues(t); lp.frequency.setTargetAtTime(f, t, 0.25); }

  // ---------- 熱血戰鼓／綜藝搖滾用的樂器 ----------
  function taiko(t, f = 62, v = 0.9) { // 大鼓陣的大太鼓：低沉、有皮革打擊感
    if (!live) return;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.04); o.frequency.exponentialRampToValueAtTime(f * 0.7, t + 0.6);
    const g = gainEnv(t, v, 0.003, 0.7); o.connect(g).connect(drumBus); send(g, 0.25); o.start(t); o.stop(t + 0.8);
    noiseHit(t, { type: 'lowpass', f: 1100, dur: 0.12, v: v * 0.45, rev: 0.2 });
  }
  function shime(t, v = 0.3) { // 高音小鼓：清脆的「噠」
    if (!live) return;
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(520, t); o.frequency.exponentialRampToValueAtTime(380, t + 0.06);
    const g = gainEnv(t, v * 0.6, 0.001, 0.08); o.connect(g).connect(drumBus); o.start(t); o.stop(t + 0.12);
    noiseHit(t, { type: 'bandpass', f: 2600, q: 1.5, dur: 0.05, v: v * 0.5 });
  }
  const sticks = (t, v = 0.35) => noiseHit(t, { type: 'bandpass', f: 3800, q: 4, dur: 0.035, v, rev: 0.15 }); // 鼓棒互敲
  function gong(t, v = 0.6) { // 金屬大鑼：幾個不成整數倍的泛音疊起來，長長的尾音
    if (!live) return;
    [[1, 1], [2.37, 0.6], [3.91, 0.4], [5.43, 0.25], [6.8, 0.15]].forEach(([r, a]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 98 * r;
      const g = gainEnv(t, v * a * 0.5, 0.01, 3.2); o.connect(g).connect(fxBus); send(g, 0.5); o.start(t); o.stop(t + 3.4);
    });
    noiseHit(t, { type: 'bandpass', f: 1800, q: 0.7, dur: 1.2, v: v * 0.25, dest: fxBus, rev: 0.5 });
  }
  // 破音電吉他：和弦送進共用的失真效果
  const power = (t, root, dur, v = 0.2) => [0, 7, 12].forEach((iv) => voice(t, root + iv, dur, { detune: [-6, 6], v, a: 0.004, r: 0.08, c0: 4000, dest: gtrIn }));
  const chug = (t, root, v = 0.18) => power(t, root, S16() * 0.7, v); // 悶音刷弦
  const lead = (t, m, dur, v = 0.12) => voice(t, m, dur, { type: 'square', detune: [-5, 5], v, a: 0.008, r: 0.12, c0: 4200, dest: fxBus, rev: 0.3 });
  const rbass = (t, m, dur, v = 0.4) => voice(t, m, dur, { detune: [0], v, a: 0.004, r: 0.05, c0: 900, dest: padBus });

  // ---------- 和聲（原創進行：小調鋪陳緊張，大調慶祝） ----------
  const MINOR = [ // Am – F – C – G
    { bass: 45, notes: [57, 60, 64] }, { bass: 41, notes: [57, 60, 65] },
    { bass: 48, notes: [55, 60, 64] }, { bass: 43, notes: [55, 59, 62] },
  ];
  const MAJOR = [ // C – G – Am – F（升一個八度、比較亮）
    { bass: 48, notes: [60, 64, 67] }, { bass: 43, notes: [59, 62, 67] },
    { bass: 45, notes: [57, 60, 64] }, { bass: 41, notes: [57, 60, 65] },
  ];
  const ARP = [0, 1, 2, 3, 4, 3, 2, 1, 0, 2, 4, 5, 4, 2, 3, 1];
  const arpNote = (ch, i) => ch.notes[i % 3] + 12 * Math.floor(i / 3);
  // 逐字重擊的和弦：每個字往上爬，越來越亢奮
  const SLAM_ROOTS = [45, 48, 50, 52, 53, 55, 57];

  // ---------- 各階段的節奏型（p.rel＝階段內第幾個 16 分音符，p.pos＝小節內位置） ----------
  const PATTERNS = {
    idle(p) {
      const ch = MINOR[p.bar % 4];
      if (p.rel === 0) lpTo(p.t, 1300);
      if (p.pos % 8 === 0) kick(p.t, 0.6);
      if (p.pos % 8 === 4) { snare(p.t, 0.18); }
      if (p.pos % 4 === 2) hat(p.t, 0.07, p.pos % 8 === 6);
      if ([0, 3, 6, 10, 12].includes(p.pos)) bass(p.t, ch.bass, S16() * 1.6, 0.32);
      if (p.pos === 0) pad(p.t, ch.notes, spb * 4, 0.06);
      if (p.pos % 2 === 0 && p.bar % 2 === 1) pluck(p.t, arpNote(ch, ARP[p.pos]) + 12, 0.045);
    },
    intro(p) {
      const ch = MINOR[p.bar % 4];
      if (p.rel === 0) { lpTo(p.t, 20000); riser(p.t, p.len * S16(), 0.22); }
      if (p.pos % 4 === 0) { kick(p.t, 0.85); p.emit('kick'); }
      if (p.pos % 4 === 2) hat(p.t, 0.12, true);
      if (p.pos % 2 === 1) hat(p.t, 0.05);
      if (p.pos % 2 === 0) bass(p.t, ch.bass, S16() * 1.5, 0.35);
      pluck(p.t, arpNote(ch, ARP[p.pos]) + 12, 0.03 + 0.07 * p.prog);
      if (p.rel >= p.len - 4) snare(p.t, 0.25 + 0.4 * ((p.rel - (p.len - 4)) / 4));
    },
    mix(p) {
      const ch = MINOR[p.bar % 4];
      if (p.rel === 0) { lpTo(p.t, 20000); crash(p.t, 0.55); }
      if (p.pos % 4 === 0) { kick(p.t, 1, true); p.emit('kick'); }
      if (p.pos === 4 || p.pos === 12) clap(p.t, 0.6);
      if (p.pos % 4 === 2) { hat(p.t, 0.15, true); bass(p.t, ch.bass + 12, S16() * 1.4, 0.5); }
      else if (p.pos % 2 === 1) hat(p.t, 0.07);
      if (p.pos % 4 === 3) bass(p.t, ch.bass, S16() * 0.8, 0.3);
      pluck(p.t, arpNote(ch, ARP[p.pos]) + 12, 0.075);
      if (p.pos === 0) pad(p.t, ch.notes.map((m) => m + 12), spb * 4, 0.045);
      if (p.pos === 14 && p.bar % 4 === 3) snare(p.t, 0.4);
      if (p.pos === 15 && p.bar % 4 === 3) snare(p.t, 0.5);
    },
    build(p) {
      const k = p.prog;
      if (p.rel === 0) riser(p.t, p.len * S16(), 0.36);
      const every = k < 0.25 ? 4 : k < 0.5 ? 2 : 1;
      const lastBeat = p.rel >= p.len - 4;
      if (p.pos % (k < 0.6 ? 4 : 2) === 0 && !lastBeat) { kick(p.t, 0.85); p.emit('kick'); }
      if (p.rel % every === 0) {
        const v = 0.15 + 0.6 * k;
        snare(p.t, v); p.emit('roll');
        if (k > 0.8) snare(p.t + S16() / 2, v * 0.85); // 最後一段 32 分音符連打
      }
      if (p.pos % 2 === 0 && !lastBeat) bass(p.t, 45 + 2 * p.bar, S16() * 1.4, 0.35);
      if (!lastBeat) pluck(p.t, arpNote(MINOR[0], ARP[p.pos]) + 12 + 2 * p.bar, 0.05 + 0.06 * k);
    },
    out(p) {
      if (p.rel === 0) { kick(p.t, 1); boom(p.t, 0.9); crash(p.t, 0.6); drone(p.t, p.len * S16() + 0.2, 0.09); }
      if (p.pos % 4 === 0) { if (p.rel) heart(p.t, 0.85); p.emit('heart'); }
      if (p.pos % 4 === 1) heart(p.t, 0.45);
      if (p.pos % 2 === 0) tick(p.t, 0.05 + 0.08 * p.prog);
    },
    dept(p) {
      const k = p.prog;
      if (p.rel === 0) {
        kick(p.t, 1); boom(p.t, 0.7); crash(p.t, 0.55); stab(p.t, [57, 64, 69, 72], 0.4);
        riser(p.t, p.len * S16(), 0.3); drone(p.t, p.len * S16(), 0.07); p.emit('hit');
      }
      if (p.pos % 4 === 0 && p.rel) { kick(p.t, 0.7 + 0.25 * k); p.emit('kick'); }
      if (p.rel >= 4) { snare(p.t, 0.06 + 0.6 * k * k); if (p.rel >= p.len - 4) snare(p.t + S16() / 2, 0.5 * k); }
    },
    surname(p) {
      const k = p.prog;
      if (p.rel === 0) riser(p.t, p.len * S16(), 0.28);
      if (p.pos % 4 === 0 && p.rel) { kick(p.t, 0.9); p.emit('kick'); }
      if (p.pos % 2 === 1) hat(p.t, 0.08);
      if (p.pos % 2 === 0) bass(p.t, 45 + Math.floor(p.rel / 4), S16() * 1.4, 0.4); // 低音每拍升半音，越等越緊
      if (p.rel >= p.len - 4) snare(p.t, 0.3 + 0.4 * k);
    },
    chars(p) {
      if (p.pos % 4 === 0 && p.rel) { kick(p.t, 0.9, true); p.emit('kick'); }
      if (p.pos === 4 || p.pos === 12) clap(p.t, 0.5);
      if (p.pos % 2 === 1) hat(p.t, 0.09);
      if (p.pos % 4 === 2) bass(p.t, 45, S16() * 1.4, 0.45);
    },
    celebrate(p) {
      const ch = MAJOR[p.bar % 4];
      if (p.rel === 0) lpTo(p.t, 20000);
      if (p.pos === 0 && p.bar % 4 === 0 && p.rel) crash(p.t, 0.4);
      if (p.pos % 4 === 0 && p.rel) { kick(p.t, 1, true); p.emit('kick'); }
      if (p.pos === 4 || p.pos === 12) clap(p.t, 0.65);
      if (p.pos % 4 === 2) { hat(p.t, 0.15, true); bass(p.t, ch.bass + 12, S16() * 1.4, 0.5); }
      else if (p.pos % 2 === 1) hat(p.t, 0.075);
      if (p.pos % 4 === 3) bass(p.t, ch.bass, S16() * 0.8, 0.3);
      pluck(p.t, arpNote(ch, ARP[p.pos]) + 12, 0.085);
      if (p.pos === 0) pad(p.t, ch.notes.map((m) => m + 12), spb * 4, 0.05);
      if (p.bar % 4 === 3 && p.pos >= 12) snare(p.t, 0.25 + 0.1 * (p.pos - 12));
    },
  };
  // ---------- 單發音效 ----------
  const SHOTS = {
    bounce(p, i) { tom(p.t, [150, 190, 240][i] || 200, 0.75); p.emit('bounce', i); },
    enter(p) { boom(p.t, 0.75); tom(p.t, 110, 0.7); },
    swell(p) { swell(p.t, spb, 0.28); },
    slam(p, i) {
      const r = SLAM_ROOTS[Math.min(i, SLAM_ROOTS.length - 1)];
      kick(p.t, 1); boom(p.t, 0.75); crash(p.t, 0.35);
      stab(p.t, [r + 12, r + 19, r + 24], 0.5);
    },
    final(p) { // 勝利號角：大調和弦長音＋往上灑的音符
      kick(p.t, 1); boom(p.t, 0.9); crash(p.t, 0.8);
      brass(p.t, [60, 64, 67, 72], spb * 3, 0.45);
      brass(p.t, [48], spb * 3, 0.25);
      [72, 76, 79, 84, 88].forEach((m, i) => pluck(p.t + S16() * (i + 1), m, 0.09));
    },
  };

  // ======================================================================
  // 第二版：熱血戰鼓（節慶大鼓陣＋銅管，140 BPM，D 小調 → D 大調）
  // ======================================================================
  const DMIN = [ // Dm – B♭ – C – A
    { bass: 38, notes: [62, 65, 69] }, { bass: 34, notes: [58, 62, 65] },
    { bass: 36, notes: [60, 64, 67] }, { bass: 33, notes: [57, 61, 64] },
  ];
  const DMAJ = [ // D – G – A – D
    { bass: 38, notes: [62, 66, 69] }, { bass: 43, notes: [62, 67, 71] },
    { bass: 45, notes: [61, 64, 69] }, { bass: 38, notes: [62, 66, 69] },
  ];
  // 慶祝段的銅管旋律（原創，D 大調五聲音階，兩小節一句；-1＝休止）
  const DRUM_TUNE = [74, -1, 78, -1, 81, -1, 78, 81, 83, -1, 81, -1, 78, -1, 74, -1,
                     76, -1, 78, -1, 81, -1, 83, -1, 86, -1, 83, 81, 78, -1, -1, -1];
  const DRUM_RIFF = [0, 3, 6, 10, 12]; // 銅管齊奏的切分位置
  const DRUMS = {
    idle(p) {
      const ch = DMIN[p.bar % 4];
      if (p.rel === 0) lpTo(p.t, 1700);
      if (p.pos === 0 || p.pos === 10) taiko(p.t, 58, 0.55);
      if (p.pos % 2 === 0) shime(p.t, p.pos % 4 === 0 ? 0.14 : 0.07);
      if (p.pos === 4 || p.pos === 12) sticks(p.t, 0.18);
      if (p.pos === 0) pad(p.t, ch.notes, spb * 4, 0.05);
      if (p.pos === 0 || p.pos === 8) bass(p.t, ch.bass, spb * 1.5, 0.25);
    },
    intro(p) {
      const ch = DMIN[p.bar % 4];
      if (p.rel === 0) { lpTo(p.t, 20000); riser(p.t, p.len * S16(), 0.2); }
      if (p.pos % 4 === 0) { taiko(p.t, 60, 0.9); p.emit('kick'); }
      shime(p.t, 0.05 + 0.25 * p.prog);
      if (p.pos % 4 === 2) bass(p.t, ch.bass, S16() * 1.5, 0.3);
      if (p.rel >= p.len - 4) taiko(p.t, 75, 0.4 + 0.5 * ((p.rel - (p.len - 4)) / 4));
    },
    mix(p) {
      const ch = DMIN[p.bar % 4];
      if (p.rel === 0) { lpTo(p.t, 20000); gong(p.t, 0.4); }
      if ([0, 6, 8].includes(p.pos)) taiko(p.t, 58, 1);
      if ([3, 11, 14].includes(p.pos)) taiko(p.t, 80, 0.65);
      if (p.pos % 4 === 0) p.emit('kick');
      shime(p.t, p.pos % 2 === 0 ? 0.26 : 0.12);
      if (p.pos === 4 || p.pos === 12) sticks(p.t, 0.45);
      if (DRUM_RIFF.includes(p.pos)) stab(p.t, ch.notes, p.pos === 0 ? 0.32 : 0.22);
      if (p.pos % 4 === 0) bass(p.t, ch.bass, S16() * 3, 0.4);
    },
    build(p) {
      const k = p.prog, lastBeat = p.rel >= p.len - 4;
      if (p.rel === 0) riser(p.t, p.len * S16(), 0.34);
      const every = k < 0.25 ? 4 : k < 0.5 ? 2 : 1;
      if (p.rel % every === 0) {
        taiko(p.t, 62 + 30 * k, 0.35 + 0.55 * k); p.emit('roll');
        if (k > 0.8) shime(p.t + S16() / 2, 0.5);
      }
      if (p.pos % 4 === 0 && !lastBeat) { p.emit('kick'); bass(p.t, 38 + 2 * p.bar, spb * 0.9, 0.35); }
      if (p.pos % 2 === 0 && !lastBeat) shime(p.t, 0.1 + 0.25 * k);
    },
    dept(p) {
      const k = p.prog;
      if (p.rel === 0) {
        taiko(p.t, 55, 1); gong(p.t, 0.7); boom(p.t, 0.6); stab(p.t, [62, 69, 74, 77], 0.4);
        riser(p.t, p.len * S16(), 0.28); drone(p.t, p.len * S16(), 0.06); p.emit('hit');
      }
      if (p.pos % 4 === 0 && p.rel) { taiko(p.t, 58, 0.6 + 0.35 * k); p.emit('kick'); }
      if (p.rel >= 4) { shime(p.t, 0.08 + 0.5 * k * k); if (p.rel >= p.len - 4) taiko(p.t + S16() / 2, 85, 0.5 * k); }
    },
    surname(p) {
      if (p.rel === 0) riser(p.t, p.len * S16(), 0.26);
      if (p.pos % 4 === 0 && p.rel) { taiko(p.t, 60, 0.9); p.emit('kick'); }
      if (p.pos % 2 === 1) shime(p.t, 0.14);
      if (p.pos % 2 === 0) bass(p.t, 38 + Math.floor(p.rel / 4), S16() * 1.4, 0.4); // 低音每拍升半音
      if (p.rel >= p.len - 4) taiko(p.t, 80, 0.4 + 0.4 * p.prog);
    },
    chars(p) {
      if (p.pos % 4 === 0 && p.rel) { taiko(p.t, 58, 1); p.emit('kick'); }
      shime(p.t, p.pos % 2 === 0 ? 0.22 : 0.1);
      if (p.pos === 4 || p.pos === 12) sticks(p.t, 0.4);
    },
    celebrate(p) {
      const ch = DMAJ[p.bar % 4];
      if (p.rel === 0) lpTo(p.t, 20000);
      if (p.pos === 0 && p.bar % 4 === 0 && p.rel) gong(p.t, 0.45);
      if ([0, 6, 8].includes(p.pos) && p.rel) taiko(p.t, 58, 1);
      if ([3, 11, 14].includes(p.pos)) taiko(p.t, 82, 0.6);
      if (p.pos % 4 === 0 && p.rel) p.emit('kick');
      shime(p.t, p.pos % 2 === 0 ? 0.24 : 0.11);
      if (p.pos === 4 || p.pos === 12) sticks(p.t, 0.45);
      if (p.pos % 4 === 0) bass(p.t, ch.bass, S16() * 3, 0.4);
      if (p.pos === 0) pad(p.t, ch.notes, spb * 4, 0.05);
      const m = DRUM_TUNE[(p.bar % 2) * 16 + p.pos];
      if (m > 0 && p.bar >= 1) brass(p.t, [m], S16() * 1.6, 0.22);
    },
  };
  const DRUM_SHOTS = {
    bounce(p, i) { taiko(p.t, [70, 85, 100][i] || 80, 0.9); p.emit('bounce', i); },
    enter(p) { gong(p.t, 0.6); taiko(p.t, 50, 1); },
    swell(p) { swell(p.t, spb, 0.25); },
    slam(p, i) {
      const r = [50, 53, 55, 57, 58, 60, 62][Math.min(i, 6)];
      taiko(p.t, 52, 1); taiko(p.t, 75, 0.7); boom(p.t, 0.7);
      brass(p.t, [r + 12, r + 19, r + 24], spb * 0.6, 0.45);
    },
    final(p) {
      taiko(p.t, 50, 1); boom(p.t, 0.9); gong(p.t, 0.9); crash(p.t, 0.5);
      brass(p.t, [62, 66, 69, 74], spb * 3, 0.5);
      [74, 78, 81, 86].forEach((m, i) => brass(p.t + S16() * 2 * (i + 1), [m], S16() * 1.5, 0.2));
    },
  };

  // ======================================================================
  // 第三版：綜藝搖滾（破音電吉他＋爵士鼓，150 BPM，E 小調 → E 大調）
  // ======================================================================
  const RMIN = [40, 36, 38, 35]; // E5 – C5 – D5 – B5 強力和弦
  const RMAJ = [40, 45, 47, 40]; // E – A – B – E
  // 慶祝段的吉他主旋律（原創，E 大調五聲音階；-1＝休止）
  const ROCK_TUNE = [76, -1, 78, 80, -1, 83, -1, 80, 85, -1, 83, -1, 80, 78, 76, -1,
                     78, -1, 80, 83, -1, 85, -1, 88, -1, 85, 83, -1, 80, -1, -1, -1];
  const ROCK = {
    idle(p) {
      const r = RMIN[p.bar % 4];
      if (p.rel === 0) lpTo(p.t, 1800);
      if (p.pos === 0 || p.pos === 10) kick(p.t, 0.6);
      if (p.pos === 8) snare(p.t, 0.3);
      if (p.pos % 2 === 0) hat(p.t, 0.06);
      if (p.pos === 0) power(p.t, r, spb * 1.5, 0.1);
      if (p.pos % 4 === 0) rbass(p.t, r - 12, spb * 0.8, 0.25);
    },
    intro(p) {
      const r = RMIN[p.bar % 4];
      if (p.rel === 0) { lpTo(p.t, 20000); riser(p.t, p.len * S16(), 0.2); }
      if (p.pos % 4 === 0) { kick(p.t, 0.9); p.emit('kick'); }
      if (p.pos % 2 === 0) { chug(p.t, r, 0.08 + 0.14 * p.prog); hat(p.t, 0.08); }
      if (p.rel >= p.len - 4) snare(p.t, 0.3 + 0.4 * ((p.rel - (p.len - 4)) / 4));
    },
    mix(p) {
      const r = RMIN[p.bar % 4];
      if (p.rel === 0) { lpTo(p.t, 20000); crash(p.t, 0.6); }
      if ([0, 6, 8, 10].includes(p.pos)) kick(p.t, 1);
      if (p.pos === 4 || p.pos === 12) snare(p.t, 0.75);
      if (p.pos % 4 === 0) p.emit('kick');
      if (p.pos % 2 === 0) hat(p.t, p.pos === 14 ? 0.16 : 0.09, p.pos === 14);
      if (p.pos === 0) power(p.t, r, S16() * 3, 0.22);
      else if (p.pos % 2 === 0) chug(p.t, r, 0.17);
      if (p.pos % 2 === 0) rbass(p.t, r - 12, S16() * 1.6, 0.4);
      if (p.bar % 4 === 3 && p.pos >= 12) snare(p.t, 0.4 + 0.1 * (p.pos - 12));
    },
    build(p) {
      const k = p.prog, lastBeat = p.rel >= p.len - 4;
      if (p.rel === 0) riser(p.t, p.len * S16(), 0.34);
      const every = k < 0.25 ? 4 : k < 0.5 ? 2 : 1;
      if (p.rel % every === 0) { snare(p.t, 0.15 + 0.6 * k); p.emit('roll'); if (k > 0.8) snare(p.t + S16() / 2, 0.6); }
      if (p.pos % 4 === 0 && !lastBeat) { kick(p.t, 0.9); p.emit('kick'); }
      if (!lastBeat) chug(p.t, 40 + 2 * p.bar, 0.08 + 0.12 * k); // 吉他 16 分音符快刷，每小節升一個全音
    },
    dept(p) {
      const k = p.prog;
      if (p.rel === 0) {
        kick(p.t, 1); boom(p.t, 0.6); crash(p.t, 0.7); power(p.t, 40, spb * 2, 0.25);
        riser(p.t, p.len * S16(), 0.28); drone(p.t, p.len * S16(), 0.06); p.emit('hit');
      }
      if (p.pos % 4 === 0 && p.rel) { kick(p.t, 0.7 + 0.25 * k); p.emit('kick'); }
      if (p.rel >= 4) { snare(p.t, 0.06 + 0.6 * k * k); if (p.rel >= p.len - 4) snare(p.t + S16() / 2, 0.5 * k); }
    },
    surname(p) {
      if (p.rel === 0) riser(p.t, p.len * S16(), 0.26);
      if (p.pos % 4 === 0 && p.rel) { kick(p.t, 0.9); p.emit('kick'); }
      if (p.pos % 2 === 0) { chug(p.t, 40 + Math.floor(p.rel / 4), 0.16); hat(p.t, 0.08); } // 每拍升半音
      if (p.rel >= p.len - 4) snare(p.t, 0.3 + 0.4 * p.prog);
    },
    chars(p) {
      if (p.pos % 4 === 0 && p.rel) { kick(p.t, 1); p.emit('kick'); }
      if (p.pos === 4 || p.pos === 12) snare(p.t, 0.6);
      if (p.pos % 2 === 0) { chug(p.t, 40, 0.15); hat(p.t, 0.09); }
    },
    celebrate(p) {
      const r = RMAJ[p.bar % 4];
      if (p.rel === 0) lpTo(p.t, 20000);
      if (p.pos === 0 && p.bar % 4 === 0 && p.rel) crash(p.t, 0.5);
      if ([0, 6, 8, 10].includes(p.pos) && p.rel) kick(p.t, 1);
      if (p.pos === 4 || p.pos === 12) snare(p.t, 0.75);
      if (p.pos % 4 === 0 && p.rel) p.emit('kick');
      if (p.pos % 2 === 0) hat(p.t, 0.1, p.pos === 14);
      if (p.pos === 0) power(p.t, r, S16() * 3, 0.2); else if (p.pos % 2 === 0) chug(p.t, r, 0.15);
      if (p.pos % 2 === 0) rbass(p.t, r - 12, S16() * 1.6, 0.4);
      const m = ROCK_TUNE[(p.bar % 2) * 16 + p.pos];
      if (m > 0 && p.bar >= 1) lead(p.t, m, S16() * 1.7, 0.11);
    },
  };
  const ROCK_SHOTS = {
    bounce(p, i) { tom(p.t, [140, 175, 220][i] || 180, 0.8); snare(p.t, 0.3); p.emit('bounce', i); },
    enter(p) { crash(p.t, 0.6); boom(p.t, 0.6); power(p.t, 40, spb * 1.5, 0.25); },
    swell(p) { swell(p.t, spb, 0.25); },
    slam(p, i) {
      const r = [40, 43, 45, 47, 48, 50, 52][Math.min(i, 6)];
      kick(p.t, 1); snare(p.t, 0.8); crash(p.t, 0.45); boom(p.t, 0.6);
      power(p.t, r, spb * 0.7, 0.28);
    },
    final(p) {
      kick(p.t, 1); boom(p.t, 0.9); crash(p.t, 0.9);
      power(p.t, 40, spb * 3, 0.3);
      [76, 80, 83, 88].forEach((m, i) => lead(p.t + S16() * (i + 1), m, i === 3 ? spb * 2 : S16(), 0.13));
    },
  };

  // ---------- 三種風格（後台「抽獎設定」可選） ----------
  const STYLES = {
    edm: { bpm: 128, patterns: PATTERNS, shots: SHOTS },
    drums: { bpm: 140, patterns: DRUMS, shots: DRUM_SHOTS },
    rock: { bpm: 150, patterns: ROCK, shots: ROCK_SHOTS },
  };
  let style = 'edm', tempo = 1;
  const patternOf = (name) => STYLES[style].patterns[name] || PATTERNS[name]; // 沒寫的階段（例如出球的心跳）共用第一版
  const shotOf = (name) => STYLES[style].shots[name] || SHOTS[name];

  // ---------- 排程器 ----------
  function phaseAt(s) {
    let ph = null;
    for (const x of phases) if (x.start <= s) ph = x;
    // 有長度、有下一段的階段（例如慶祝 32 小節後回待機），時間到自動接下去
    while (ph && ph.len && ph.next && s >= ph.start + ph.len) {
      const nx = { name: ph.next, start: ph.start + ph.len, len: 0 };
      phases = phases.filter((x) => x.start < nx.start).concat(nx);
      ph = nx;
    }
    return ph;
  }
  function emitAt(tp, type, data) {
    if (!listeners[type]) return;
    setTimeout(() => listeners[type].forEach((fn) => { try { fn(data); } catch {} }), Math.max(0, (tp - nowSec()) * 1000));
  }
  function runStep(s, off) {
    const tp = stepTime(s);
    const late = tp < nowSec() - 0.05; // 分頁被丟到背景時計時器會被拖慢，過期的拍子直接跳過
    const ph = phaseAt(s);
    if (!ph) return;
    const audible = !late && ctx && ctx.state === 'running' && !muted;
    const rel = s - ph.start;
    const p = {
      t: ctx ? tp - off : 0, rel, pos: rel % 16, bar: Math.floor(rel / 16), len: ph.len,
      prog: ph.len ? Math.min(rel / ph.len, 1) : 0,
      emit: (type, extra) => { if (!late) emitAt(tp, type, { phase: ph.name, rel, pos: rel % 16, bar: Math.floor(rel / 16), prog: ph.len ? rel / ph.len : 0, extra }); },
    };
    live = audible;
    try { const fn = patternOf(ph.name); fn && fn(p); } catch (e) { console.error(e); }
    const due = shots.filter((x) => x.step === s);
    if (due.length) {
      shots = shots.filter((x) => x.step > s);
      for (const x of due) {
        try { const fn = shotOf(x.name); fn && fn(p, x.arg); } catch (e) { console.error(e); }
      }
    }
    live = false;
    if (rel % 4 === 0) p.emit('beat');
  }
  function tick_() {
    const horizon = nowSec() + 0.14;
    const off = ctx ? audioOffset() : 0;
    while (stepTime(nextStep) < horizon) runStep(nextStep++, off);
  }

  // ---------- 對外介面 ----------
  const M = {
    // 瀏覽器規定要有點擊／按鍵才能出聲，所以在使用者第一次互動時呼叫
    unlock() {
      build();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      if (!running) {
        running = true;
        t0 = nowSec() + 0.08; nextStep = 0;
        phases = [{ name: 'idle', start: 0, len: 0 }]; shots = [];
        timer = setInterval(tick_, 25);
      }
    },
    get running() { return running; },
    beatMs: () => spb * 1000,
    beatNow: () => (nowSec() - t0) / spb,
    // 下一個整拍（至少留 lead 秒，讓排程器來得及排）
    nextBeat(lead = 0.16) { return Math.ceil(M.beatNow() + lead / spb); },
    // 從 from 拍算起，下一個小節開頭
    nextBar(from, lead = 0.3) { return from + Math.ceil((M.beatNow() + lead / spb - from) / 4) * 4; },
    // 等到第 b 拍（lead 毫秒前就先醒來）
    waitBeat(b, lead = 0) {
      return new Promise((res) => setTimeout(res, Math.max(0, (t0 + b * spb) * 1000 - lead - performance.now())));
    },
    // 從第 beat 拍開始換到某個階段；len（拍）到了之後接 next
    phase(name, beat, len = 0, next = null) {
      const start = Math.round(beat * 4);
      phases = phases.filter((x) => x.start < start).concat({ name, start, len: Math.round(len * 4), next });
    },
    shot(beat, name, arg) { shots.push({ step: Math.round(beat * 4), name, arg }); },
    // 回到待機（中斷流程時用），從下一拍開始
    idle() { if (running) { const b = M.nextBeat(); shots = []; M.phase('idle', b); } },
    // 換配樂風格與速度倍率（拍速一變，節拍軸從下一刻重新起算，所以只在沒抽獎時呼叫）
    setStyle(name, speed = 1) {
      if (!STYLES[name]) name = 'edm';
      speed = Math.min(Math.max(Number(speed) || 1, 0.8), 1.2);
      const v = Math.round(STYLES[name].bpm * speed);
      style = name; tempo = speed;
      if (v === bpm) return;
      bpm = v; spb = 60 / bpm;
      if (running) { t0 = nowSec() + 0.08; nextStep = 0; phases = [{ name: phases.length ? phases[phases.length - 1].name : 'idle', start: 0, len: 0 }]; shots = []; }
    },
    get style() { return style; },
    // 後台試聽：攪拌 2 小節 → 減速 1 小節 → 姓名重擊兩下 → 勝利號角＋慶祝 4 小節，然後安靜
    demo(name) {
      M.unlock();
      M.setStyle(name, tempo);
      const b = M.nextBeat();
      shots = [];
      M.phase('intro', b, 4);
      M.phase('mix', b + 4);
      M.phase('build', b + 12, 4);
      M.phase('chars', b + 16, 4);
      M.shot(b + 16, 'slam', 0); M.shot(b + 18, 'slam', 1); M.shot(b + 19, 'swell');
      M.phase('celebrate', b + 20, 16, 'silent');
      M.shot(b + 20, 'final');
      return (36 * spb + 1) * 1000; // 試聽總長（毫秒）
    },
    stop() { if (running) { shots = []; M.phase('silent', M.nextBeat()); } },
    setVolume(v) { volume = Math.min(Math.max(Number(v), 0), 1); if (master && !muted) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05); },
    setMuted(m) { muted = !!m; if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.05); },
    on(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
  };
  window.LotteryMusic = M;
})();
