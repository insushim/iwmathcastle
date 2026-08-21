#!/usr/bin/env node
// tools/qa-restart-cooldown.mjs — 새 게임이 이전 판의 스킬 쿨다운을 물려받지 않는가
//
// 쿨다운은 `gameClock`의 **절대값**으로 저장된다. gameClock은 판이 바뀌어도 리셋하지
// 않으므로(리셋하면 남은 절대값이 미래로 남아 스킬이 영구 잠긴다) 새 판에서는 쿨다운
// 쪽을 비워야 한다. 안 비우면 직전 판에서 쓴 스펠이 새 게임 시작부터 잠긴 채로 뜬다
// (실측: 수정 전 새 게임에 fireball 쿨다운 3,003ms 이월).
// ⚠️ 이 회귀는 getState가 wizardCooldowns를 노출하기 전까지 어떤 게이트도 못 잡았다.
// 사용: node tools/qa-restart-cooldown.mjs
import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import puppeteer from "puppeteer";
const ROOT="/Users/sim-insu/Documents/dev/iwmathsung/iwmathcastle", PORT=8985;
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
await p.evaluateOnNewDocument(()=>{try{localStorage.setItem("mathcastle:howto",JSON.stringify({never:true}));}catch{}});
await p.goto(`http://localhost:${PORT}/`,{waitUntil:"networkidle0"});
await p.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise(r=>setTimeout(r,1500));
// 긴 쿨다운 스펠 시전 → 게임오버
await p.evaluate(async()=>{const h=window.__mathcastle; h.qaSetWizardLevel(6); await h.qaCastSpell("fireball",600,400);});
await new Promise(r=>setTimeout(r,500));
const cast=await p.evaluate(()=>{const s=window.__mathcastle.getState();
  return {clock:Math.round(s.gameClock), cds:Object.entries(s.spellCooldowns).filter(([,v])=>v>0).map(([k,v])=>`${k}:+${Math.round(v-s.gameClock)}ms`)};});
console.log(`  시전 직후 → gameClock ${cast.clock} · 남은 쿨다운 ${cast.cds.join(", ")||"없음"}`);
await p.evaluate(()=>window.__mathcastle.qaForceGameOver());
await new Promise(r=>setTimeout(r,1200));
// 재시작 → 새 게임
await p.evaluate(()=>{const b=document.getElementById("restartGameBtn"); if(b) b.click(); else throw new Error("restartGameBtn 없음");});
await new Promise(r=>setTimeout(r,1500));
await p.evaluate(()=>{const b=document.querySelector('.difficulty-btn[data-difficulty="4-1"]'); if(b) b.click();});
await new Promise(r=>setTimeout(r,2500));
const fresh=await p.evaluate(()=>{const s=window.__mathcastle.getState();
  return {clock:Math.round(s.gameClock), running:s.gameRunning,
    stuck:Object.entries(s.spellCooldowns).filter(([,v])=>v>s.gameClock).map(([k,v])=>`${k}:+${Math.round(v-s.gameClock)}ms`)};});
console.log(`  새 게임 시작 → gameClock ${fresh.clock} · running=${fresh.running}`);
const ok = fresh.stuck.length === 0 && fresh.running;
console.log(fresh.stuck.length ? `  ❌ 이월된 쿨다운: ${fresh.stuck.join(", ")}` : `  ✅ 이월 없음`);
if (!fresh.running) console.log("  ❌ 새 게임이 시작되지 않음 — 시나리오를 못 밟았다(게이트 무효)");
console.log(ok ? "\n✅ RESTART COOLDOWN PASS" : "\n❌ RESTART COOLDOWN FAIL");
await b.close();server.close();
process.exit(ok ? 0 : 1);
