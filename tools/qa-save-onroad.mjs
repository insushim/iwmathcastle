#!/usr/bin/env node
// tools/qa-save-onroad.mjs — "저장 → 새로고침 → 이어하기" 후 타워가 길 위에 남는지 실측
//
// ⚠️ qa-tower-onroad.mjs는 리사이즈만 한다. 리사이즈는 regenerateLayout()이
//    살아있는 towers 배열을 훑어 길 위 타워를 옮겨주지만, 이어하기는
//      regenerateLayout()  ← 이 시점에 towers는 아직 비어 있다
//      savedState.towers.forEach(recreateTower)  ← 옛 절대좌표를 그대로 심는다
//    순서라 그 구제가 적용되지 않는다. 그 구멍을 이 테스트가 막는다.
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";
import { seedSkipHowTo } from "./qa-common.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.argv[2]) || 8971;
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".webp":"image/webp",".mp3":"audio/mpeg",".svg":"image/svg+xml",".woff2":"font/woff2",".webmanifest":"application/manifest+json" };
const server = createServer((req,res)=>{ let p=req.url.split("?")[0]; if(p==="/")p="/index.html";
  const fp=join(ROOT,p); if(!fp.startsWith(ROOT)||!existsSync(fp)){res.writeHead(404);res.end();return;}
  res.writeHead(200,{"Content-Type":MIME[extname(fp)]||"application/octet-stream"}); res.end(readFileSync(fp)); });
await new Promise((r,j)=>{server.on("error",j);server.listen(PORT,r);});

const browser = await puppeteer.launch({ headless:"shell",
  executablePath:`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args:["--disable-gpu","--no-sandbox","--mute-audio"] });
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
let pass=0, fail=0;
const check=(n,ok,d="")=>{ if(ok){pass++;console.log(`    ✅ ${n}${d?" — "+d:""}`);} else {fail++;console.log(`    ❌ ${n}${d?" — "+d:""}`);} };

const countOnRoad = (page) => page.evaluate(() => {
  const h=window.__mathcastle, L=h.qaLayout();
  const half=(L.roadWidth+Math.round(18*L.scale))/2;
  const limit=half+20*0.6*L.scale;
  const pts=h.qaPathPoints(); const bad=[];
  for(const t of h.qaTowers()){
    let minD=Infinity;
    for(const p of pts){const dx=t.x-p.x,dy=t.y-p.y,d=dx*dx+dy*dy; if(d<minD)minD=d;}
    if(Math.sqrt(minD)<limit) bad.push({x:Math.round(t.x),y:Math.round(t.y),d:Math.round(Math.sqrt(minD))});
  }
  return {total:h.qaTowers().length, bad, limit:Math.round(limit)};
});

try {
  console.log("[저장 → 이어하기 후에도 타워가 길 위에 없는가]");
  // 저장할 때와 불러올 때의 창 크기를 다르게 한다 —
  // 전체화면 토글·주소창 표시/숨김·기기 회전으로 실제 자주 벌어지는 상황이다.
  for (const [w1,h1,w2,h2,name] of [
    [1440,900,1180,760,"데스크톱 창 축소"],
    [1440,900,1440,900,"같은 크기(레이아웃 동일)"],
    [905,360,844,390,"폰 가로 회전"],
  ]) {
    console.log(`\n  ▸ ${name} — 저장 ${w1}×${h1} → 이어하기 ${w2}×${h2}`);
    const page = await browser.newPage();
    await page.setViewport({width:w1,height:h1});
    await seedSkipHowTo(page);
    await page.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle0",timeout:30000});
    await wait(700);
    await page.evaluate(()=>document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
    await wait(3200);
    await page.evaluate(()=>{const h=window.__mathcastle; h.qaAddGold(9000); h.qaPlaceTowers("copper",10); h.qaPlaceTowers("ice",6);});
    await wait(600);
    const before = await countOnRoad(page);
    check("저장 직전에는 길 위 타워 0기", before.bad.length===0, `${before.total}기 중 ${before.bad.length}기`);

    await page.evaluate(()=>document.getElementById("saveGameBtn")?.click());
    await wait(800);
    const saved = await page.evaluate(()=>!!localStorage.getItem("mathcastle:save"));
    check("세이브 생성됨", saved);

    // 새로고침 후 다른 창 크기로 이어하기
    await page.setViewport({width:w2,height:h2});
    await page.reload({waitUntil:"networkidle0",timeout:30000});
    await wait(900);
    await page.evaluate(()=>document.getElementById("loadGameBtn")?.click());
    await wait(3000);

    const after = await countOnRoad(page);
    check("이어하기 후 길 위 타워 0기", after.bad.length===0,
      `${after.total}기 중 ${after.bad.length}기 겹침${after.bad.length?" "+JSON.stringify(after.bad.slice(0,3)):""}`);
    check("이어하기로 타워가 사라지지 않음", after.total===before.total, `${before.total} → ${after.total}기`);
    await page.screenshot({path:join(ROOT,"screenshots",`saveonroad-${name.replace(/[ ()×]/g,"_")}.png`)});
    await page.close();
  }

  // ── 결정적 케이스: 세이브 좌표 자체가 길 한복판인 경우 ──
  // 구버전 빌드가 만든 세이브(길 배치가 달랐다)를 지금 빌드에서 여는 상황과 동일하다.
  // 창 크기만 바꾸는 검사로는 이 결함이 안 잡힌다 — 옛 좌표가 화면 밖으로 밀려나
  // "길에서 멀다"고 통과해 버리기 때문이다(실측으로 확인한 게이트 구멍).
  {
    console.log(`\n  ▸ 세이브 좌표가 길 위인 경우 (구버전 세이브 재현)`);
    const page = await browser.newPage();
    await page.setViewport({width:1440,height:900});
    await seedSkipHowTo(page);
    await page.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle0",timeout:30000});
    await wait(700);
    await page.evaluate(()=>document.querySelector('.difficulty-btn[data-difficulty="4-1"]')?.click());
    await wait(3200);
    await page.evaluate(()=>{const h=window.__mathcastle;h.qaAddGold(9000);h.qaPlaceTowers("copper",6);});
    await wait(500);
    await page.evaluate(()=>document.getElementById("saveGameBtn")?.click());
    await wait(700);
    const planted = await page.evaluate(()=>{
      const h=window.__mathcastle, pts=h.qaPathPoints();
      const picks=[0.2,0.35,0.5,0.65,0.8,0.9].map(f=>pts[Math.floor(pts.length*f)]);
      const w=JSON.parse(localStorage.getItem("mathcastle:save"));
      w.data.towers.forEach((t,i)=>{const q=picks[i%picks.length];t.tile={x:Math.round(q.x-20),y:Math.round(q.y-20)};});
      localStorage.setItem("mathcastle:save",JSON.stringify(w));
      return w.data.towers.length;
    });
    await page.reload({waitUntil:"networkidle0",timeout:30000});
    await wait(900);
    await page.evaluate(()=>document.getElementById("loadGameBtn")?.click());
    await wait(3200);
    const r = await countOnRoad(page);
    check("길 위 좌표 세이브를 열어도 타워가 길에 안 남음", r.bad.length===0,
      `${planted}기 심어 ${r.total}기 복원, 길 위 ${r.bad.length}기${r.bad.length?" "+JSON.stringify(r.bad.slice(0,3)):""}`);
    check("한 칸에 두 타워가 겹치지 않음", await page.evaluate(()=>{
      const seen=new Set();
      for(const e of document.querySelectorAll('.tower')){const k=e.style.left+","+e.style.top; if(seen.has(k))return false; seen.add(k);} return true;
    }), "복원된 타워 좌표 전부 서로 다름");
    check("타워 수가 유지됨", r.total===planted, `${planted} → ${r.total}기`);
    await page.screenshot({path:join(ROOT,"screenshots","saveonroad-planted.png")});
    await page.close();
  }
} catch(e){ fail++; console.log("  ❌ 예외:", e.message); }
finally {
  console.log(`\n결과: ${pass} PASS · ${fail} FAIL`);
  await browser.close(); server.close(); process.exit(fail?1:0);
}
