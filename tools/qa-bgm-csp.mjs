// tools/qa-bgm-csp.mjs — 실제 CSP(_headers)가 걸린 환경에서 BGM이 실제로 나는지
//
// ⚠️ qa-audio.mjs는 자체 정적 서버로 돌아서 _headers(CSP)가 안 걸린다. BGM이 v9부터
//    fetch(connect-src)가 아니라 <audio>(**media-src**)를 타므로, CSP 쪽 사고는
//    거기서 영원히 안 잡힌다. 그래서 이 검사만 wrangler 대상으로 따로 돈다.
//    (new Audio()는 DOM에 안 붙어 querySelector로 못 찾는다 — 생성자를 후킹해서 잡는다.)
//
// 사전조건: npx wrangler pages dev . --port 8791 --local
// 사용: node tools/qa-bgm-csp.mjs [http://localhost:8791/]
import puppeteer from "puppeteer";
const URL=process.argv[2]||"http://localhost:8791/";
const b=await puppeteer.launch({headless:"shell",
  executablePath:`${process.env.HOME}/.cache/puppeteer/chrome-headless-shell/mac_arm-150.0.7871.24/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
  args:["--disable-gpu","--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
const p=await b.newPage();
const csp=[],errs=[];
p.on("console",m=>{const t=m.text();
  if(/Content Security Policy|Refused to/i.test(t))csp.push(t);
  if(m.type()==="error")errs.push(t);});
await p.evaluateOnNewDocument(()=>{
  try{localStorage.setItem("mathcastle:howto",JSON.stringify({never:true}));}catch{}
  // new Audio()는 DOM에 붙지 않는다 — 생성 시점에 붙잡아 둔다
  window.__audioEls=[];
  const NativeAudio=window.Audio;
  window.Audio=function(...a){const el=new NativeAudio(...a);window.__audioEls.push(el);return el;};
  window.Audio.prototype=NativeAudio.prototype;
});
await p.goto(URL,{waitUntil:"networkidle0"});
await p.click('.difficulty-btn[data-difficulty="4-1"]');
await new Promise(r=>setTimeout(r,7000));
const res=await p.evaluate(()=>{
  const els=(window.__audioEls||[]).map(a=>({src:(a.currentSrc||a.src||"").split("/").pop(),paused:a.paused,t:Math.round(a.currentTime*100)/100,loop:a.loop,err:a.error?a.error.code:null}));
  return {els, media:els.length};
});
console.log("[CSP 환경 BGM 실측]");
console.log("  audio element:", JSON.stringify(res.els));
const playing=res.els.some(e=>!e.paused&&e.t>0);
console.log(playing?"  ✅ BGM 스트리밍 재생 중(CSP media-src 통과)":"  ❌ BGM이 나지 않음");
console.log("  CSP 위반:",csp.length, csp.slice(0,3).join(" | "));
const real=errs.filter(e=>!/404|favicon|firebase|api\//i.test(e));
console.log("  콘솔 에러:",real.length, real.slice(0,3).join(" | "));
await b.close();
process.exit(playing&&csp.length===0?0:1);
