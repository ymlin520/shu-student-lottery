// 用 ElevenLabs 的「音效」模型產生抽獎畫面要用的音效檔，存到 public/assets/
//
// 用法（在這個資料夾按住 Shift 右鍵 →「在這裡開啟 PowerShell 視窗」）：
//   1. 先把金鑰放進 elevenlabs-key.txt（這個檔已被 .gitignore 排除，不會上傳）
//      或設環境變數 ELEVENLABS_API_KEY
//   2. node scripts/gen-sfx.mjs            產生還沒有的檔案
//      node scripts/gen-sfx.mjs --force    全部重新產生（會覆蓋舊檔）
//      node scripts/gen-sfx.mjs 名稱       只產生指定的那一個
//
// 注意：音效用的是 eleven_text_to_sound_v2。Eleven v4／v4 Turbo 是「語音合成」
// （文字轉人聲）模型，不能拿來產生音效，兩者是不同的 API 端點。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = path.join(ROOT, 'public', 'assets');
const API = 'https://api.elevenlabs.io/v1/sound-generation';

// 每個音效：檔名、給模型的英文描述、長度（秒）、是否要能無縫循環
// prompt 用英文，模型對英文描述的理解明顯比較準
const SOUNDS = [
  {
    name: 'ball-roll',
    text: 'Many small plastic lottery balls tumbling and rattling continuously inside a clear spinning drum, '
      + 'dry plastic clatter, steady and even, no music, no voice',
    duration: 10,
    loop: true,
    note: '攪拌時的滾球底噪（循環播放）',
  },
  {
    name: 'ball-clack',
    text: 'A few plastic lottery balls knocking against each other, short dry clacks, close microphone, '
      + 'no reverb, no music',
    duration: 1.5,
    note: '球互相碰撞的喀啦聲',
  },
  {
    name: 'ball-out',
    text: 'A single plastic lottery ball rolls down a chute and drops out with a soft hollow thud, '
      + 'slow, clean, no music',
    duration: 3,
    note: '中獎球滾出來',
  },
  {
    name: 'ball-bounce',
    text: 'A single small plastic ball bounces once on a hard floor, bright short bounce, no music',
    duration: 1,
    note: '開場球落地彈跳',
  },
  {
    name: 'ball-into-drum',
    text: 'A plastic ball drops into a hollow acrylic lottery drum with a deep resonant thunk, '
      + 'single impact, no music',
    duration: 2,
    note: '球跳進抽獎機',
  },
];

function readKey() {
  const env = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (env) return env;
  const f = path.join(ROOT, 'elevenlabs-key.txt');
  if (fs.existsSync(f)) {
    const k = fs.readFileSync(f, 'utf8').trim();
    if (k) return k;
  }
  return '';
}

const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.filter((a) => !a.startsWith('--'));

const key = readKey();
if (!key) {
  console.error('找不到 API 金鑰。');
  console.error('請在這個資料夾建立 elevenlabs-key.txt 並貼上金鑰，或設環境變數 ELEVENLABS_API_KEY。');
  console.error('（elevenlabs-key.txt 已被 .gitignore 排除，不會上傳 GitHub）');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

let made = 0, skipped = 0, failed = 0, chars = 0;
for (const s of SOUNDS) {
  if (only.length && !only.includes(s.name)) continue;
  const file = path.join(OUT, s.name + '.mp3');
  if (fs.existsSync(file) && !force) {
    console.log(`略過 ${s.name}.mp3（已存在，要重做請加 --force）`);
    skipped++;
    continue;
  }
  process.stdout.write(`產生 ${s.name}.mp3（${s.note}）… `);
  try {
    const r = await fetch(API + '?output_format=mp3_44100_128', {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: s.text,
        model_id: 'eleven_text_to_sound_v2',
        duration_seconds: s.duration,
        prompt_influence: 0.5,
        ...(s.loop ? { loop: true } : {}),
      }),
    });
    if (!r.ok) {
      const msg = await r.text().catch(() => '');
      console.log(`失敗（HTTP ${r.status}）`);
      if (msg) console.log('   ' + msg.slice(0, 300));
      failed++;
      continue;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(file, buf);
    chars += Number(r.headers.get('character-cost') || 0);
    console.log(`完成（${Math.round(buf.length / 1024)} KB）`);
    made++;
  } catch (e) {
    console.log('失敗：' + e.message);
    failed++;
  }
}

console.log(`\n產生 ${made} 個、略過 ${skipped} 個、失敗 ${failed} 個`);
if (chars) console.log(`本次計費字元數：${chars}`);
if (made) console.log(`檔案位置：${OUT}`);
