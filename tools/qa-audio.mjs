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

  // ⑤ BGM — 파일 트랙이 실제로 "소리가 나는 상태"로 도는지.
  //    v9부터 통째 디코드(AudioBuffer)가 아니라 <audio> 스트리밍이다. 그래서 버퍼 존재가
  //    아니라 **재생 위치가 실제로 흐르는지**로 확인한다(멈춰 있으면 무음이다).
  const bgm = await page.evaluate(async () => {
    const { MusicSystem } = await import("/music.js");
    const m = new MusicSystem();
    await m.init();
    m.play("gameplay");
    const el = () => m._trackEl;
    for (let i = 0; i < 60 && !(el() && el().currentTime > 0); i++)
      await new Promise(r => setTimeout(r, 100));
    const t1 = el() ? el().currentTime : 0;
    await new Promise(r => setTimeout(r, 600));
    const t2 = el() ? el().currentTime : 0;
    const res = {
      playing: !!el() && !el().paused,
      advanced: t2 > t1,             // 재생 위치가 흐른다 = 진짜 나고 있다
      t2: Math.round(t2 * 100) / 100,
      dur: el() ? Math.round(el().duration) : 0,
      looping: el()?.loop === true,
      procRunning: !!m.schedulerTimer,   // 절차 스케줄러는 돌면 안 된다(파일이 재생 중이므로)
    };
    m.stop();
    return res;
  });
  check("BGM 파일이 실제 재생됨(스트리밍)", bgm.playing && bgm.advanced,
    `gameplay ${bgm.dur}초 · 재생위치 ${bgm.t2}초`);
  check("BGM이 루프 재생됨", bgm.looping);
  check("BGM 재생 중 절차 합성은 안 돌아감", !bgm.procRunning);

  // ⑤-b 회귀 방지 — BGM을 통째로 디코드하지 않는다.
  //    예전 구현은 원본 2.98MB를 PCM 92MB로 폈고(gameplay 한 곡 68.2MB), 4GB 웨일북에서
  //    이게 메모리를 밀어내고 디코드가 게임 시작을 수 초 얼렸다. 다시 그리로 가지 않도록
  //    "긴 트랙을 decodeAudioData에 넣지 않는다"를 직접 단언한다.
  const pcm = await page.evaluate(async () => {
    const A = window.AudioContext || window.webkitAudioContext;
    const orig = A.prototype.decodeAudioData;
    let maxSec = 0;
    A.prototype.decodeAudioData = function (ab, ...rest) {
      return orig.call(this, ab, ...rest).then((buf) => {
        maxSec = Math.max(maxSec, buf.duration);
        return buf;
      });
    };
    const { MusicSystem } = await import("/music.js");
    const m = new MusicSystem();
    await m.init();
    m.play("gameplay");
    await new Promise(r => setTimeout(r, 2500));
    m.stop();
    A.prototype.decodeAudioData = orig;
    return maxSec;
  });
  check("BGM을 통째로 디코드하지 않음(메모리 회귀 방지)", pcm < 10,
    `가장 긴 decodeAudioData ${pcm.toFixed(1)}초 (효과음만이어야 함)`);

  // ⑤-c BGM 폴백 2 — <audio>.play()가 **거절**될 때도 무음이 되면 안 된다.
  //    ⚠️ 이 게이트는 브라우저를 --autoplay-policy=no-user-gesture-required 로 띄우기 때문에
  //       실제 자동재생 거절이 재현되지 않는다. 그래서 거절을 직접 주입해서 검사한다.
  //       (구현이 play() 프라미스 거부를 삼키면 파일도 안 나고 절차 합성도 안 켜져
  //        완전 무음이 된다 — 코드리뷰가 지적한 실제 결함이라 회귀 게이트로 고정한다.)
  const bgmReject = await page.evaluate(async () => {
    const proto = HTMLMediaElement.prototype;
    const origPlay = proto.play;
    proto.play = function () {
      return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    };
    const { MusicSystem } = await import("/music.js");
    const m = new MusicSystem();
    await m.init();
    m.play("gameplay");
    for (let i = 0; i < 40 && !m.schedulerTimer; i++)
      await new Promise(r => setTimeout(r, 50));
    const res = { proc: !!m.schedulerTimer, elPlaying: !!m._trackEl };
    m.stop();
    proto.play = origPlay;
    return res;
  });
  check("BGM 재생이 거절돼도 무음이 아니라 절차 합성으로 떨어짐", bgmReject.proc,
    `scheduler=${bgmReject.proc}`);

  // ⑤-d 게임오버 원샷이 루프 BGM을 실제로 끄는지.
  //    _playOneShot이 스케줄러만 끄고 파일 트랙을 안 끄면 "게임오버인데 전투 음악이
  //    계속 나는" 상태가 된다(실측으로 재현했던 결함 — 회귀 게이트로 고정).
  const oneShot = await page.evaluate(async () => {
    const { MusicSystem } = await import("/music.js");
    const m = new MusicSystem();
    await m.init();
    m.play("gameplay");
    for (let i = 0; i < 40 && !(m._trackEl && m._trackEl.currentTime > 0); i++)
      await new Promise(r => setTimeout(r, 100));
    const before = !!m._trackEl && !m._trackEl.paused;
    m.play("defeat");
    await new Promise(r => setTimeout(r, 800));
    const after = !!m._trackEl && !m._trackEl.paused;
    m.stop();
    return { before, after };
  });
  check("게임오버 징글이 울릴 때 전투 BGM이 꺼짐(겹침 없음)",
    oneShot.before && !oneShot.after,
    `재생중→${oneShot.before} · 원샷후→${oneShot.after}`);

  // ⑥ BGM 폴백 — mp3를 못 받는 상황(파일 누락·오프라인)에서 절차 합성으로 떨어져야 한다.
  //    실제 트랙명(boss)으로 검사한다 — 존재하지 않는 트랙명은 합성 패턴도 없어서 대조군이 못 된다.
  //    ⚠️ <audio>는 fetch를 안 탄다 — 네트워크 차단은 요청 가로채기로 해야 한다.
  // 이 구간에서 나는 콘솔 에러는 우리가 일부러 만든 것이다 — 마지막 "콘솔 에러 0건"
  // 검사에서 이 구간만 정확히 걷어낸다(전체를 정규식으로 무르게 하지 않기 위해).
  const errBefore = errors.length;
  await page.setRequestInterception(true);
  const blockBoss = (req) => {
    if (req.url().includes("bgm/boss.mp3")) req.abort().catch(() => {});
    else req.continue().catch(() => {});
  };
  page.on("request", blockBoss);
  const bgmFb = await page.evaluate(async () => {
    const { MusicSystem } = await import("/music.js");
    const m = new MusicSystem();
    await m.init();
    m.play("boss");
    for (let i = 0; i < 40 && !m._trackFailed.has("boss"); i++)
      await new Promise(r => setTimeout(r, 100));
    const res = { failed: m._trackFailed.has("boss"), proc: !!m.schedulerTimer };
    m.stop();
    return res;
  });
  page.off("request", blockBoss);
  await page.setRequestInterception(false);
  await new Promise((r) => setTimeout(r, 200)); // 차단 에러가 늦게 도착하는 것까지 흡수
  // ⚠️ 구간을 통째로 지우면 그 4초 사이에 난 **진짜 회귀**까지 같이 사라져 게이트가 헛돈다.
  //    우리가 유발한 네트워크 차단 메시지만 골라 뺀다.
  const intentional = /ERR_FAILED|ERR_ABORTED|Failed to load resource/i;
  for (let i = errors.length - 1; i >= errBefore; i--) {
    if (intentional.test(errors[i])) errors.splice(i, 1);
  }
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
