#!/usr/bin/env node
// tools/qa-tower-render.mjs — 타워 전 타입 실게임 렌더 회귀
// v6 사고: 랜덤 상자가 goldMine/shredder/repairStation/ultimate를 뽑으면
// towerRenderer가 매 프레임 TypeError → 그 뒤에 그려지는 몬스터·이펙트가 통째로 사라졌다.
// 이 테스트는 각 타워를 실제 게임에 세우고 (1) 콘솔 에러 0 (2) 몬스터가 계속 그려지는지 확인한다.
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";
import http from "http"; import fs from "fs"; import path from "path";
const MIME={".js":"text/javascript",".json":"application/json",".html":"text/html",".css":"text/css",".webp":"image/webp",".png":"image/png"};
const PORT=8097;
const srv=http.createServer((q,s)=>{let p=path.join(process.cwd(),decodeURIComponent(q.url.split("?")[0]));if(p.endsWith("/"))p+="index.html";
 fs.readFile(p,(e,d)=>{if(e){s.writeHead(404);s.end();}else{s.writeHead(200,{"Content-Type":MIME[path.extname(p)]||"application/octet-stream"});s.end(d);}});});
await new Promise(r=>srv.listen(PORT,r));
const EXE=`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`;
const b=await puppeteer.launch({headless:"shell",executablePath:EXE,args:["--disable-gpu","--no-sandbox","--mute-audio"]});
const p=await b.newPage();
await p.setViewport({width:1440,height:900});
const errors=[];
p.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
p.on("pageerror",e=>errors.push("PAGEERROR: "+e.message));
  await seedSkipHowTo(p);
await p.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle0",timeout:30000});
await new Promise(r=>setTimeout(r,1500));
await p.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise(r=>setTimeout(r,3500));
await p.evaluate(()=>document.getElementById("startWaveBtn")?.click());
await new Promise(r=>setTimeout(r,2500));

const types = await p.evaluate(async()=>Object.keys((await import("/gameData.js")).TOWER_STATS));
let pass=0, fail=0;
console.log("[타워 렌더 회귀 — 실게임]");
for (const t of types) {
  errors.length = 0;
  const before = await p.evaluate(()=>window.__mathcastle.getState().monsters);
  await p.evaluate((ty)=>window.__mathcastle.qaPlaceTowers(ty,1), t);
  await new Promise(r=>setTimeout(r,700));
  // 몬스터가 실제로 캔버스에 그려지는지: 동적 캔버스의 비투명 픽셀 수로 판정
  const drawn = await p.evaluate(()=>{
    const c=[...document.querySelectorAll("canvas")].find(x=>x.width>200);
    const g=c.getContext("2d"); const d=g.getImageData(0,0,c.width,c.height).data;
    let n=0; for(let i=3;i<d.length;i+=4*17) if(d[i]>10) n++;
    return n;
  });
  const st = await p.evaluate(()=>window.__mathcastle.getState());
  const bad = errors.filter(e=>!/favicon|firebase|net::|Failed to load resource/i.test(e));
  const ok = bad.length===0 && drawn>50;
  if (ok) { pass++; console.log(`  ✅ ${t} (몬스터 ${st.monsters}, 픽셀 ${drawn})`); }
  else { fail++; console.log(`  ❌ ${t} — 에러 ${bad.length}건 ${bad[0]||""} / 그려진 픽셀 ${drawn}`); }
}
await b.close(); srv.close();
console.log(`\n${fail===0?"✅ TOWER RENDER PASS":"❌ FAIL"} (${pass} PASS / ${fail} FAIL)`);
process.exit(fail?1:0);
