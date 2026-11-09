const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync("src/lib/grade-outbox.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const site = http.createServer((request, response) => {
  if (request.url === "/outbox.js") {
    response.setHeader("Content-Type", "application/javascript");
    return response.end("const exports={};\n" + source + "\nwindow.GradeOutbox=exports.GradeOutbox;");
  }
  response.setHeader("Content-Type", "text/html");
  response.end('<!doctype html><script src="/outbox.js"></script>');
});
const driver = spawn("safaridriver", ["-p", "19482"], { stdio: "inherit" });
const api = async (method, path, body) => {
  const reply = await fetch("http://127.0.0.1:19482" + path, {
    method, headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await reply.json();
  if (!reply.ok) throw Error(JSON.stringify(result.value));
  return result.value;
};
const check = (value, message) => { if (!value) throw Error(message); };
function fill() {
  let value = "";
  for (let size = 1024 * 1024; size >= 1; size >>= 1) {
    for (let attempt = 0; attempt < 12; attempt++) {
      try { localStorage.setItem("fixture-fill", value + "x".repeat(size)); value += "x".repeat(size); }
      catch (error) {
        if (error.name !== "QuotaExceededError") throw error;
        break;
      }
    }
  }
  try { localStorage.setItem("fixture-fill", value + "y"); } catch (error) { return error.name; }
  throw Error("Safari storage was not full");
}
(async () => {
  await new Promise(resolve => site.listen(0, "127.0.0.1", resolve));
  for (let i = 0; i < 50; i++) {
    try { await api("GET", "/status"); break; } catch { await new Promise(resolve => setTimeout(resolve, 150)); }
  }
  const { sessionId } = await api("POST", "/session", { capabilities: { alwaysMatch: { browserName: "safari" } } });
  const session = "/session/" + sessionId;
  const url = "http://127.0.0.1:" + site.address().port;
  const open = () => api("POST", session + "/url", { url });
  const execute = async fn => {
    const result = await api("POST", session + "/execute/async", {
      args: [], script: `const done=arguments[0]; const check=${check}; const fill=${fill};
        Promise.resolve().then(${fn}).then(done,e=>done({error:String(e),stack:e.stack}));`,
    });
    assert.equal(result?.error, undefined, JSON.stringify(result));
    return result;
  };
  try {
    await open();
    const agent = await execute(async () => {
      const box = new GradeOutbox(localStorage, "teacher", () => "safari-new-draft");
      const snapshot = { protocol:1,context_complex_id:1,cursor:"start",value:{},versions:{},
        calendar_context:{known:true,active_semester_id:"current"} };
      localStorage.setItem(box.prefix+"snapshot", JSON.stringify({...snapshot,value:{cache:"x".repeat(1000000)}}));
      check(fill()==="QuotaExceededError","expected actual Safari quota");
      box.accept(snapshot);
      check(localStorage.getItem(box.prefix+"snapshot")===null,"legacy snapshot remains on disk");
      fill();
      box.editCell({},["student","1","days","sun","hifz"],"one");
      check(box.drafts()[0].status==="pending","new draft not retained");
      await box.persistVolatile();
      check(!box.volatileDrafts().length,"IndexedDB did not commit the draft");
      check(localStorage.getItem(box.prefix+"operation:safari-new-draft")===null,"expected IndexedDB fallback");
      return navigator.userAgent;
    });
    assert.match(agent, /Safari\//);
    await open();
    await execute(async () => {
      const box = new GradeOutbox(localStorage, "teacher");
      await box.hydrate();
      const draft = box.drafts()[0];
      check(draft?.packet.operation_id==="safari-new-draft","draft missing after reopen");
      const failed = await box.flush(async () => { throw Error("offline"); }).then(()=>false,()=>true);
      check(failed && box.drafts()[0].status==="pending","offline save reported success");
      await box.flush(async packet => ({ok:true,operation_id:packet.operation_id,input_sha256:"a".repeat(64)}));
      check(box.drafts()[0].status==="confirmed","receipt did not confirm the draft");
      const snapshot={protocol:1,context_complex_id:1,cursor:"end",value:{student:{1:{days:{sun:{hifz:"one"}}}}},versions:{},
        calendar_context:{known:true,active_semester_id:"current"}};
      box.accept(snapshot);
      check(box.view({}).student[1].days.sun.hifz==="one","confirmed value not visible");
      return true;
    });
    console.log("PASS: Safari WebDriver actual quota, durable fallback across navigation, offline retry and confirmed snapshot");
  } finally { await api("DELETE", session).catch(() => undefined); }
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { driver.kill(); site.close(); });
