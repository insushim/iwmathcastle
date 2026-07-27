#!/usr/bin/env node
// tools/qa-wizard-flicker.mjs — 마법사가 깜빡이지 않는지 실측
//
// 사용자 신고(2026-07-27): "마법사가 깜빡거리네"
// 원인: 키를 짧게 끊어 누르면 walk↔idle이 매 프레임 뒤집히고, 두 포즈의
//   부유 높이(+4px vs -2px)와 기울기(0.04rad vs 0)가 달라 마법사가 튀었다.
//   가만히 서 있을 때나 계속 이동할 때는 안 나온다 — 그래서 기존 QA가 못 잡았다.
// 검사: 실제 조작 패턴(누름 120ms / 뗌 120ms)에서 포즈 교체 횟수와
//   화면상 세로 위치(부유 오프셋)의 프레임간 급변을 잰다.
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8995;
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".webp":"image/webp",".mp3":"audio/mpeg",".svg":"image/svg+xml",".woff2":"font/woff2",".webmanifest":"application/manifest+json" };
const server = createServer((req,res)=>{ let p=req.url.split("?")[0]; if(p==="/")p="/index.html";
  const fp=join(ROOT,p); if(!fp.startsWith(ROOT)||!existsSync(fp)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{"Content-Type":MIME[extname(fp)]||"application/octet-stream"}); res.end(readFileSync(fp)); });
await new Promise((r,j)=>{server.on("error",j);server.listen(PORT,r);});

const browser = await puppeteer.launch({ headless:"shell",
  executablePath:`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args:["--disable-gpu","--no-sandbox","--mute-audio"] });
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
const ok=(n,c,d="")=>{ if(c){pass++;console.log(`  ✅ ${n}${d?" — "+d:""}`);} else {fail++;console.log(`  ❌ ${n}${d?" — "+d:""}`);} };

try {
  const page = await browser.newPage();
  await page.setViewport({width:1440,height:900});
  await seedSkipHowTo(page);
  await page.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle0",timeout:30000});
  await wait(700);
  await page.evaluate(()=>document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
  await wait(3000);

  await page.evaluate(()=>{
    window.__log=[]; window.__frameMark=0;
    const proto=CanvasRenderingContext2D.prototype, origDraw=proto.drawImage, origTr=proto.translate;
    let lastY=null;
    proto.translate=function(x,y){ lastY=y; return origTr.call(this,x,y); };
    proto.drawImage=function(img,...a){
      if(img && img.src && /wizard-/.test(img.src))
        window.__log.push({f:window.__frameMark, s:img.src.split('/').pop(), y:lastY});
      return origDraw.call(this,img,...a);
    };
    const raf=window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame=(cb)=>raf(t=>{window.__frameMark++;return cb(t);});
  });

  console.log("\n[끊어 누르며 이동 — 실제 조작 패턴]");
  for (let i=0;i<12;i++){ await page.keyboard.down("KeyD"); await wait(120); await page.keyboard.up("KeyD"); await wait(120); }
  const r = await page.evaluate(()=>{
    const byFrame=new Map();
    for(const e of window.__log) if(!byFrame.has(e.f)) byFrame.set(e.f,e);
    const frames=[...byFrame.entries()].sort((a,b)=>a[0]-b[0]).map(e=>e[1]);
    let swaps=0; for(let i=1;i<frames.length;i++) if(frames[i].s!==frames[i-1].s) swaps++;
    // idle↔walk 사이를 오간 횟수 (walk 프레임끼리 도는 건 정상 애니메이션)
    const kind=(s)=>/idle/.test(s)?"idle":/cast/.test(s)?"cast":"walk";
    let poseFlips=0; for(let i=1;i<frames.length;i++) if(kind(frames[i].s)!==kind(frames[i-1].s)) poseFlips++;
    // 세로 위치 급변 (부유 오프셋 튐)
    let maxJump=0; for(let i=1;i<frames.length;i++){
      const a=frames[i].y, b=frames[i-1].y;
      if(typeof a==="number"&&typeof b==="number") maxJump=Math.max(maxJump,Math.abs(a-b));
    }
    return {프레임:frames.length, 스프라이트교체:swaps, 포즈전환:poseFlips, 최대세로점프:Math.round(maxJump*10)/10};
  });
  console.log(`     프레임 ${r.프레임} · 스프라이트 교체 ${r.스프라이트교체} · 포즈전환 ${r.포즈전환} · 최대 세로 점프 ${r.최대세로점프}px`);
  // 걷기 4프레임 순환은 정상이므로 스프라이트 교체 자체는 허용.
  // 문제는 idle↔walk를 오가는 것과, 그때 생기는 세로 튐이다.
  ok("idle↔walk 왕복이 3회 이하", r.포즈전환 <= 3, `${r.포즈전환}회 (수정 전 실측 10회 이상)`);
  ok("프레임간 세로 점프가 3px 이하", r.최대세로점프 <= 3, `${r.최대세로점프}px (수정 전 최대 6px)`);
  ok("마법사가 매 프레임 그려짐", r.프레임 > 20, `${r.프레임}프레임`);
  await page.close();
} catch(e){ fail++; console.log("  ❌ 예외:", e.message); }
finally {
  console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
  await browser.close(); server.close(); process.exit(fail?1:0);
}
