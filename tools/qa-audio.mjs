#!/usr/bin/env node
// tools/qa-audio.mjs — CC0 효과음 배선 검증
// ① 29개 샘플이 전부 서빙·디코드됨  ② play()가 합성이 아니라 샘플 경로를 탐
// ③ 샘플이 없으면 절차 합성으로 폴백(무음 아님)  ④ 볼륨 설정이 샘플에도 적용
// 사용: node tools/qa-audio.mjs [포트=8941]

import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8941;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };

const served = [];
const server = createServer((req, res) => {
  let p = req.url.split("?")[0];
  if (p === "/") p = "/index.html";
  const fp = join(ROOT, decodeURIComponent(p));
  if (!fp.startsWith(ROOT) || !existsSync(fp)) { res.writeHead(404); res.end(); return; }
  if (p.includes("/audio/")) served.push(p);
  res.writeHead(200, { "Content-Type": MIME[extname(fp)] || "application/octet-stream" });
  res.end(readFileSync(fp));
});
await new Promise((r, j) => { server.on("error", j); server.listen(PORT, r); });

const browser = await puppeteer.launch({
  headless: "shell",
  executablePath: `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  // ⚠️ --mute-audio는 쓰지 않는다(재생 경로를 죽일 수 있음). autoplay 허용으로 AudioContext를 살린다.
  args: ["--disable-gpu", "--no-sandbox", "--autoplay-policy=no-user-gesture-required"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  ✅ ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? " — " + detail : ""}`); }
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  console.log("[CC0 효과음 배선]");
  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle0", timeout: 30000 });
  await page.click('.difficulty-btn[data-difficulty="4-1"]');
  await wait(3500);

  // ① 샘플 로드 — sfx 모듈의 실제 상태를 본다
  const st = await page.evaluate(async () => {
    const { sfx } = await import("/sfx.js");
    await sfx.init();
    for (let i = 0; i < 40 && sfx.samples.size === 0; i++) await new Promise(r => setTimeout(r, 250));
    return { ready: sfx.isReady, loaded: sfx.samples.size, ctx: sfx.audioContext?.state };
  });
  check("AudioContext 활성", st.ready && st.ctx === "running", `state=${st.ctx}`);
  check("CC0 샘플 29개 전부 디코드됨", st.loaded === 29, `${st.loaded}/29`);

  // ② play()가 합성이 아닌 샘플 경로를 타는지 — createBufferSource 호출을 세어 판별
  const routed = await page.evaluate(async () => {
    const { sfx } = await import("/sfx.js");
    const ctx = sfx.audioContext;
    let bufferSrc = 0, osc = 0;
    const oBuf = ctx.createBufferSource.bind(ctx), oOsc = ctx.createOscillator.bind(ctx);
    ctx.createBufferSource = () => { bufferSrc++; return oBuf(); };
    ctx.createOscillator = () => { osc++; return oOsc(); };
    for (const k of ["hit", "explosion", "math_correct", "wave_start", "goldMine"]) {
      sfx.lastPlayTimes[k] = 0;          // 쿨다운 우회
      sfx.play(k);
      await new Promise(r => setTimeout(r, 30));
    }
    ctx.createBufferSource = oBuf; ctx.createOscillator = oOsc;
    return { bufferSrc, osc };
  });
  check("play()가 샘플 경로로 감(합성 오실레이터 미사용)",
    routed.bufferSrc === 5 && routed.osc === 0, `buffer=${routed.bufferSrc} osc=${routed.osc}`);

  // ③ 폴백 — 샘플을 지우면 합성으로 떨어져야 한다(무음이면 안 됨)
  const fb = await page.evaluate(async () => {
    const { sfx } = await import("/sfx.js");
    const ctx = sfx.audioContext;
    const saved = new Map(sfx.samples);
    sfx.samples.clear();
    let osc = 0;
    const oOsc = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => { osc++; return oOsc(); };
    sfx.lastPlayTimes["hit"] = 0;
    sfx.play("hit");
    await new Promise(r => setTimeout(r, 50));
    ctx.createOscillator = oOsc;
    saved.forEach((v, k) => sfx.samples.set(k, v));   // 원복
    return { osc, restored: sfx.samples.size };
  });
  check("샘플 없으면 절차 합성 폴백(무음 아님)", fb.osc > 0, `oscillator ${fb.osc}회`);
  check("폴백 테스트 후 샘플 원복", fb.restored === 29, `${fb.restored}/29`);

  // ④ 볼륨 설정이 샘플에도 걸리는지 (masterGain 경유 확인)
  const vol = await page.evaluate(async () => {
    const { sfx } = await import("/sfx.js");
    sfx.setVolume(0.2);
    await new Promise(r => setTimeout(r, 120));
    return sfx.masterGain.gain.value;
  });
  check("볼륨 설정이 샘플 경로에도 적용(masterGain 경유)", vol < 0.5, `masterGain=${vol.toFixed(2)}`);

  // ⑤ BGM — 파일 트랙이 실제로 로드·루프 재생되는지
  const bgm = await page.evaluate(async () => {
    const { MusicSystem } = await import("/music.js");
    const m = new MusicSystem();
    await m.init();
    m.play("gameplay");
    for (let i = 0; i < 60 && !m.trackBuffers.has("gameplay"); i++)
      await new Promise(r => setTimeout(r, 250));
    const buf = m.trackBuffers.get("gameplay");
    const res = {
      loaded: !!buf,
      dur: buf ? Math.round(buf.duration) : 0,
      looping: m._trackNode?.loop === true,
      procRunning: !!m.schedulerTimer,   // 절차 스케줄러는 돌면 안 된다(파일이 재생 중이므로)
    };
    m.stop();
    return res;
  });
  check("BGM 파일 로드·디코드", bgm.loaded, `gameplay ${bgm.dur}초`);
  check("BGM이 루프 재생됨", bgm.looping);
  check("BGM 재생 중 절차 합성은 안 돌아감", !bgm.procRunning);

  // ⑥ BGM 폴백 — mp3를 못 받는 상황(파일 누락·오프라인)에서 절차 합성으로 떨어져야 한다.
  //    실제 트랙명(boss)으로 검사한다 — 존재하지 않는 트랙명은 합성 패턴도 없어서 대조군이 못 된다.
  const bgmFb = await page.evaluate(async () => {
    const { MusicSystem } = await import("/music.js");
    const m = new MusicSystem();
    await m.init();
    const realFetch = window.fetch;
    window.fetch = (u, ...r) =>
      String(u).includes("bgm/boss.mp3")
        ? Promise.resolve(new Response("", { status: 404 }))
        : realFetch(u, ...r);
    m.play("boss");
    for (let i = 0; i < 40 && !m._trackFailed.has("boss"); i++)
      await new Promise(r => setTimeout(r, 100));
    const res = { failed: m._trackFailed.has("boss"), proc: !!m.schedulerTimer };
    window.fetch = realFetch;
    m.stop();
    return res;
  });
  check("BGM 파일을 못 받으면 절차 합성으로 폴백(무음 아님)", bgmFb.failed && bgmFb.proc,
    `failed=${bgmFb.failed} scheduler=${bgmFb.proc}`);

  // ⑦ 실제 HTTP 서빙 확인
  const audioReqs = [...new Set(served)].filter(p => p.endsWith(".mp3"));
  check("브라우저가 실제로 오디오를 받아감", audioReqs.length >= 30,
    `${audioReqs.length}개 (효과음 29 + BGM)`);

  const real = errors.filter(e => !/404|favicon|firebase|api\//i.test(e));
  check("콘솔 에러 0건", real.length === 0, real.slice(0, 2).join(" | "));
} catch (e) {
  fail++;
  console.log("  ❌ 예외:", e.message);
} finally {
  console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
  await browser.close();
  server.close();
  process.exit(fail ? 1 : 0);
}
