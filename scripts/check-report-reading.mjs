// Read-only rendered regression check against an explicitly isolated preview.
// Supply --playwright, --chrome, --dossier, --classic, --symbol and --report-id.
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const args = Object.fromEntries(Array.from({length:(process.argv.length-2)/2},(_,i)=>[process.argv[2+i*2]?.replace(/^--/,""),process.argv[3+i*2]]));
for (const key of ["playwright","chrome","dossier","classic","symbol","report-id"]) assert(args[key],`Missing --${key}`);
for (const key of ["dossier","classic"]) { const u=new URL(args[key]); assert(["127.0.0.1","localhost"].includes(u.hostname)&&u.port!=="3000","Use a separate loopback preview port"); }
assert(/^[1-9]\d*$/.test(args["report-id"]),"Invalid selected report ID");
const { chromium } = createRequire(import.meta.url)(args.playwright);
const browser = await chromium.launch({headless:true,executablePath:args.chrome});
const checks=[],mutations=[];
const route=`/company/${encodeURIComponent(args.symbol)}/report/${args["report-id"]}`;
const sections=["verdict","business","fundamentals","balanceSheet","valuation","quality","technicals","leadership","competitive","catalystsRisks","outlook","projections","macro","appendix"];
try {
  for (const layout of ["dossier","classic"]) for (const theme of ["current","workspace"]) {
    const context=await browser.newContext();
    await context.addCookies([{name:"thesis-ui-design",value:theme,url:args[layout]}]);
    await context.route("**/*",r=>["127.0.0.1","localhost"].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());
    const page=await context.newPage();
    page.on("request",r=>{if(!["GET","HEAD"].includes(r.method()))mutations.push(r.url());});
    for (const width of [1920,1280,390,320]) {
      await page.setViewportSize({width,height:width<500?844:720});
      await page.goto(args[layout]+route,{waitUntil:"networkidle"});
      assert.equal(await page.locator("body").getAttribute("data-ui-layout"),layout);
      for (const section of sections) assert.equal(await page.locator(`#report-${section}`).count(),1,section);
      const jump=page.locator(`${layout === "dossier" ? ".dossier-grade-navigation" : ".report-grade-strip"} a[href="#report-valuation"]`);
      await jump.focus(); await jump.press("Enter"); await page.waitForTimeout(100);
      const bounds=await page.evaluate(()=>({top:document.getElementById("report-valuation").getBoundingClientRect().top,stickyBottom:document.querySelector(".report-grade-strip").getBoundingClientRect().bottom,client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
      assert(bounds.top>=bounds.stickyBottom-2,JSON.stringify({layout,theme,width,...bounds}));
      assert(bounds.scroll<=bounds.client+1,JSON.stringify({layout,theme,width,...bounds}));
      checks.push({layout,theme,width,...bounds});
    }
    await context.close();
  }
  const context=await browser.newContext({javaScriptEnabled:false,userAgent:"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36",viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.goto(args.dossier+route,{waitUntil:"networkidle"});
  for (const section of sections) assert(await page.locator(`#report-${section}`).isVisible(),`No-JS section hidden: ${section}`);
  const source=page.locator('details[data-evidence-key] > summary:visible').first();
  assert(await source.count(),"No native evidence disclosure");
  const before=await source.evaluate(e=>e.parentElement.open);
  await source.press("Enter"); await page.waitForTimeout(100);
  assert.equal(await source.evaluate(e=>e.parentElement.open),!before,"Native source did not toggle");
  checks.push({javaScript:false,visibleSections:14,nativeEvidenceToggle:true});
  await context.close();
  assert.deepEqual(mutations,[],"Reading must not start or retry a run");
  console.log(JSON.stringify({passed:checks.length,checks,mutations},null,2));
} finally { await browser.close(); }
