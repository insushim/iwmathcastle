#!/usr/bin/env node
// tools/qa-meteor-pause.mjs — 일시정지 중 벽시계 setTimeout이 게임 상태를 바꾸지 않는가
//
// 메테오샤워는 낙하를 `setTimeout`으로 흩뿌리는데, 이 타이머는 게임 루프 밖이라
// **일시정지를 모른다.** 그대로 두면 멈춘 화면에서 몬스터가 맞아 죽고 골드·점수가 오른다
// (실측: 정지 3초 동안 2발이 떨어졌다). 반대로 정지 중이라고 그냥 버리면 아이가 쓴 스펠이
// 사라지므로, 미뤘다가 재개될 때 떨어뜨려야 한다 — 이 게이트는 그 둘을 같이 본다.
//
// ⚠️ 관측은 캔버스/DOM 이펙트 생성 수로 한다. 피해량으로 재려 했더니 후반 몬스터 체력에
//    묻혀 골드가 안 움직여서 수정 전/후가 구분되지 않았다(둔감한 게이트였다).
// ⚠️ 스펠 키는 `meteorShower`다. `meteor`는 타워 타입 이름이라 시전이 조용히 무시된다.
// 사용: node tools/qa-meteor-pause.mjs
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import puppeteer from "puppeteer";
const ROOT="/Users/sim-insu/Documents/dev/iwmathsung/iwmathcastle", PORT=8989;
const MIME={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webp":"image/webp",".mp3":"audio/mpeg",".woff2":"font/woff2",".svg":"image/svg+xml",".png":"image/png"};
const server=createServer((q,r)=>{let p=q.url.split("?")[0];if(p==="/")p="/index.html";const fp=join(ROOT,p);
 if(!fp.startsWith(ROOT)||!existsSync(fp)){r.writeHead(404);r.end();return;}
 r.writeHead(200,{"Content-Type":MIME[extname(fp)]||"application/octet-stream"});r.end(readFileSync(fp));});
await new Promise(r=>server.listen(PORT,r));
const b=await puppeteer.launch({headless:"shell",
  executablePath:`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args:["--disable-gpu","--no-sandbox","--mute-audio"]});
const p=await b.newPage();
await p.setViewport({width:1366,height:768});
await p.evaluateOnNewDocument(()=>{
  try{localStorage.setItem("mathcastle:howto",JSON.stringify({never:true}));}catch{}
  // 낙하 1발마다 createMagicEffect("magic-attack")가 불린다 — DOM 생성 시점을 센다
  window.__strikes=0;
  const obs=new MutationObserver((ms)=>{for(const m of ms)for(const n of m.addedNodes)
    if(n.nodeType===1&&n.className&&String(n.className).includes("magic-attack")) window.__strikes++;});
  document.addEventListener("DOMContentLoaded",()=>obs.observe(document.body,{childList:true,subtree:true}));
});
await p.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle0"});
await p.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{const h=window.__mathcastle;h.qaSetWave(20);h.qaAddGold(50000);h.qaSetWizardLevel(10);});
await p.click("#startWaveBtn");
await new Promise(r=>setTimeout(r,4000));
const R=await p.evaluate(async()=>{
  // ⚠️ 낙하 판정을 `.magic-attack` DOM 노드로 세면 안 된다. 저사양 강등(quality.low)에서
  //    createMagicEffect가 DOM 이펙트를 **정상적으로** 건너뛰므로(캔버스만 그린다),
  //    메테오가 멀쩡히 떨어져도 0발로 읽힌다 — 실제로 부하가 걸린 전체 스위트 실행에서
  //    이 게이트만 "회귀"로 오판됐다. 착탄 자체를 세는 훅으로 바꾼다.
  const strikes = () => window.__mathcastle.qaMeteorDrops();
  const base = strikes();
  const t=window.__mathcastle.qaGetMonsters()[0];
  window.__mathcastle.qaCastSpell("meteorShower", t?t.x:innerWidth/2, t?t.y:innerHeight/2);
  await new Promise(r=>setTimeout(r,60));
  document.getElementById("pauseBtn").click();
  const atPause=strikes()-base;
  await new Promise(r=>setTimeout(r,3000));
  const duringPause=strikes()-base;
  document.getElementById("pauseBtn").click();
  await new Promise(r=>setTimeout(r,3000));
  return {atPause, duringPause, afterResume:strikes()-base};
});
console.log(`  정지 시점 ${R.atPause}발 → 정지 3초 후 ${R.duringPause}발 → 재개 3초 후 ${R.afterResume}발`);
console.log(`  ${R.duringPause===R.atPause ? "✅ 정지 중 낙하 없음" : "❌ 정지 중에도 "+(R.duringPause-R.atPause)+"발 떨어짐"}`);
const okPause = R.duringPause === R.atPause;
const okResume = R.afterResume > R.duringPause;
console.log(`  ${okResume ? "✅ 재개 후 정상 낙하(스펠 안 버려짐)" : "❌ 재개해도 안 떨어짐 — 회귀"}`);
console.log(okPause && okResume ? "\n✅ METEOR PAUSE PASS" : "\n❌ METEOR PAUSE FAIL");
await b.close();server.close();
process.exit(okPause && okResume ? 0 : 1);
