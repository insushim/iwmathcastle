// tools/qa-perf-profile.mjs — 웨일북 성능 "진단" 도구 (게이트 아님)
//
// qa-perf.mjs가 합격/불합격만 알려준다면, 이건 **어디에 시간이 가는지**를 보여준다.
// 2026-08-21 웨일북 렉을 이걸로 찾았다: getBoundingClientRect가 JS self-time 5.3%로
// 최상위 → 렌더 루프가 매 프레임 레이아웃을 강제하고 있었다.
//
// 사용: node tools/qa-perf-profile.mjs [스로틀=12] [웨이브=25]
//       TRACE=0 을 주면 트레이싱(래스터/페인트 집계)을 끈다.
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const ROOT = "/Users/sim-insu/Documents/dev/iwmathsung/iwmathcastle";
const THROTTLE = Number(process.argv[2]) || 12;
const WAVE = Number(process.argv[3]) || 25;
const PORT = 8951;
const MIME = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json", ".webp":"image/webp", ".mp3":"audio/mpeg", ".woff2":"font/woff2", ".svg":"image/svg+xml", ".png":"image/png" };
const server = createServer((req,res)=>{
  let p=req.url.split("?")[0]; if(p==="/")p="/index.html";
  const fp=join(ROOT,p);
  if(!fp.startsWith(ROOT)||!existsSync(fp)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{"Content-Type":MIME[extname(fp)]||"application/octet-stream"});
  res.end(readFileSync(fp));
});
await new Promise(r=>server.listen(PORT,r));

const browser = await puppeteer.launch({
  headless:"shell",
  executablePath:`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args:["--disable-gpu","--no-sandbox","--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({width:1366,height:768});
// 웨일북 하드웨어 신고값 에뮬레이션
await page.evaluateOnNewDocument(()=>{
  Object.defineProperty(navigator,"deviceMemory",{get:()=>4});
  Object.defineProperty(navigator,"hardwareConcurrency",{get:()=>2});
  try{localStorage.setItem("mathcastle:howto",JSON.stringify({never:true}));}catch{}
  // 프레임당 JS 작업시간을 직접 잰다. rAF 간격은 vsync에 스냅돼(16.7/33.3) 경계 근처
  // 변화를 못 가른다 — 게임 루프가 실제로 태운 시간을 재야 A/B가 성립한다.
  const raw = window.requestAnimationFrame.bind(window);
  window.__rawRaf = raw;
  window.__frameJs = [];
  window.requestAnimationFrame = function (cb) {
    return raw(function (ts) {
      const t0 = performance.now();
      try { cb(ts); } finally { window.__frameJs.push(performance.now() - t0); }
    });
  };
});
page.on("console",m=>{const t=m.text(); if(/perfQuality|sfx|music|저사양/.test(t)) console.log("  [page]",t);});
await page.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle0"});
await page.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise(r=>setTimeout(r,1500));
await page.evaluate((w)=>{
  const h=window.__mathcastle;
  h.qaSetWave(w); h.qaAddGold(999999);
  h.qaPlaceTowers("multiply",10); h.qaPlaceTowers("ice",2); h.qaPlaceTowers("meteor",2);
},WAVE);
await page.click("#startWaveBtn");
await new Promise(r=>setTimeout(r,6000));

const cdp = await page.createCDPSession();
await cdp.send("Emulation.setCPUThrottlingRate",{rate:THROTTLE});
await cdp.send("Profiler.enable");
await cdp.send("Profiler.setSamplingInterval",{interval:200});
await cdp.send("Profiler.start");
const TRACE = process.env.TRACE !== "0";
if (TRACE) await page.tracing.start({categories:["devtools.timeline","disabled-by-default-devtools.timeline"],path:"/tmp/mc-trace.json"});
const frames = await page.evaluate(()=>new Promise(res=>{
  const raw=window.__rawRaf;
  window.__frameJs.length=0;              // 측정 구간만 남긴다
  const f=[];let last=performance.now();const s=last;
  (function tick(now){f.push(now-last);last=now;
    if(now-s>8000){
      f.sort((a,b)=>a-b);
      const js=window.__frameJs.slice().sort((a,b)=>a-b);
      res({n:f.length,med:f[f.length>>1],p95:f[Math.floor(f.length*.95)],
        jsN:js.length,
        jsMed:js[js.length>>1],
        jsP95:js[Math.floor(js.length*.95)],
        jsMean:js.reduce((a,b)=>a+b,0)/js.length,
        monsters:window.__mathcastle.getState().monsters});return;}
    raw(tick);})(performance.now());
}));
if (TRACE) await page.tracing.stop();
const {profile} = await cdp.send("Profiler.stop");
await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});

// self-time 집계
const byId=new Map(); for(const n of profile.nodes) byId.set(n.id,n);
const self=new Map();
const total=profile.samples.length;
for(const id of profile.samples){
  const n=byId.get(id); if(!n)continue;
  const cf=n.callFrame;
  const key=`${cf.functionName||"(anonymous)"} @ ${(cf.url||"").split("/").pop()}:${cf.lineNumber+1}`;
  self.set(key,(self.get(key)||0)+1);
}
console.log(`\n[웨일북 에뮬 · CPU ${THROTTLE}배 · 웨이브 ${WAVE}]`);
console.log(`  몬스터 ${frames.monsters} · 저사양모드 ${frames.low}`);
console.log(`  프레임 간격 중앙값 ${frames.med.toFixed(1)}ms (${(1000/frames.med).toFixed(1)}fps) · p95 ${frames.p95.toFixed(1)}ms`);
console.log(`  ▶ 프레임당 JS 작업 중앙값 ${frames.jsMed.toFixed(2)}ms · 평균 ${frames.jsMean.toFixed(2)}ms · p95 ${frames.jsP95.toFixed(2)}ms (${frames.jsN}프레임)`);
console.log(`\n  샘플 ${total}개 · self-time 상위 25:`);
[...self.entries()].sort((a,b)=>b[1]-a[1]).slice(0,25)
  .forEach(([k,v])=>console.log(`   ${(v/total*100).toFixed(1).padStart(5)}%  ${k}`));
if (TRACE) {
  const t = JSON.parse(readFileSync("/tmp/mc-trace.json","utf8"));
  const ev = Array.isArray(t) ? t : t.traceEvents;
  const agg = {};
  for (const e of ev) if (e.ph === "X" && e.dur) agg[e.name] = (agg[e.name]||0)+e.dur;
  const f = frames.jsN || 1;
  const pick = (n)=>((agg[n]||0)/1000/f).toFixed(2);
  console.log(`  ▶ 프레임당 RasterTask ${pick("RasterTask")}ms · Commit ${pick("Commit")}ms · Paint ${pick("Paint")}ms · 레이아웃 ${pick("UpdateLayoutTree")}ms · 디코드 ${pick("Decode Image")}ms`);
}
await browser.close(); server.close();
