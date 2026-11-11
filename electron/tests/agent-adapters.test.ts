import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createAgentAdapter, probeAgent } from "../src/agents/adapters";
import { agentCommand, AgentProcess } from "../src/agents/process";
import type { AgentEvent, AgentProfile } from "../src/agents/types";

// These are real child processes speaking the documented native wire protocols,
// not a mocked spawn. No model provider, account or network access is required.
const fixture = String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const engine = __filename.split(/[\\/]/).pop().split('.')[0];
const trace = (message) => fs.appendFileSync('trace.jsonl', JSON.stringify(message) + '\n');
const out = (message) => process.stdout.write(JSON.stringify(message) + '\n');
trace({ args: process.argv.slice(2) });
if (process.argv.includes('--version')) { console.log(engine + ' fixture 1.0'); process.exit(0); }
let prompt = '', confirmResolve;
const hooks = {};
const finish = () => {
  if (engine === 'codex') out({ method:'turn/completed', params:{ turn:{id:'turn-1',status:'completed'} } });
  if (engine === 'claude') out({ type:'result', subtype:'success', is_error:false });
  if (engine === 'pi') out({ type:'agent_settled', aborted:prompt !== 'complete' });
};
async function initialize() {
  if(engine === 'pi') {
    const source = fs.readFileSync(process.argv[process.argv.indexOf('-e') + 1], 'utf8');
    const extension = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    extension.default({ on:(name,fn)=>{hooks[name]=fn;} });
    hooks.session_start({}, {ui:{ notify:(message)=>out({type:'extension_ui_request', id:'ready', method:'notify', message}) }});
  }
}
function approval() {
  const toolName = engine === 'claude' ? 'Bash' : 'bash';
  if (engine === 'codex') out({id:'approve-1',method:'item/commandExecution/requestApproval',params:{command:'touch approved',cwd:process.cwd()}});
  if (engine === 'claude') out({type:'control_request',request_id:'approve-1',request:{subtype:'can_use_tool',tool_name:toolName,input:{command:'touch approved'}}});
  if (engine === 'pi') {
    hooks.tool_call({toolName,input:{command:'touch approved'}},{hasUI:true,ui:{confirm:(title,message)=>new Promise(resolve=>{
      confirmResolve=resolve;out({type:'extension_ui_request',id:'approve-1',method:'confirm',title,message});
    })}}).then(result=>{trace({gate: result || {allowed:true}});});
  }
}
function started(text) {
  prompt = text;
  if(text === 'crash') { process.stderr.write('fatal native agent crash'); process.exit(9); }
  if(text === 'malformed') { console.log('not-json'); return; }
  if(engine === 'codex') {
    out({method:'turn/started',params:{turn:{id:'turn-1'}}});
    out({method:'item/agentMessage/delta',params:{itemId:'text-1',delta:'Hello '}});
    out({method:'item/agentMessage/delta',params:{itemId:'text-1',delta:'world'}});
  }
  if(engine === 'claude') {
    out({type:'stream_event',event:{type:'message_start',message:{id:'text-1'}}});
    for(const text of ['Hello ','world']) out({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text}}});
    out({type:'assistant',message:{id:'text-1',content:[{type:'text',text:'Hello world'}]}});
  }
  if(engine === 'pi') {
    out({type:'message_start',message:{role:'assistant'}});
    for(const delta of ['Hello ','world']) out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta}});
    out({type:'agent_end',messages:[]});
  }
  approval();
}
initialize().then(() => {
  readline.createInterface({input:process.stdin}).on('line',line=>{
    const m = JSON.parse(line); trace(m);
    if(engine === 'codex') {
      if(m.method === 'initialize') out({id:m.id,result:{userAgent:'fixture'}});
      else if(m.method === 'thread/start') out({id:m.id,result:{thread:{id:'thread-1'}}});
      else if(m.method === 'turn/start') {out({id:m.id,result:{turn:{id:'turn-1'}}});started(m.params.input[0].text);}
      else if(m.method === 'turn/interrupt') {out({id:m.id,result:{}});finish();}
      else if(m.id === 'approve-1' && prompt === 'complete') finish();
    }
    if(engine === 'claude') {
      if(m.type === 'control_request') {out({type:'control_response',response:{subtype:'success',request_id:m.request_id,response:{}}});if(m.request.subtype==='interrupt')finish();}
      if(m.type === 'user') started(m.message.content);
      if(m.type === 'control_response' && prompt === 'complete') finish();
    }
    if(engine === 'pi') {
      if(m.type === 'extension_ui_response') {confirmResolve?.(m.confirmed);if(prompt==='complete')finish();}
      else {out({id:m.id,type:'response',command:m.type,success:true,data:{}});if(m.type==='prompt')started(m.message);if(m.type==='abort')finish();}
    }
  });
});
`;

async function waitFor(check: () => boolean, timeout = 4000) {
  const end = Date.now() + timeout;
  while (!check()) {
    if (Date.now() > end) assert.fail("Timed out waiting for protocol event");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function setup(t: any, engine: AgentProfile["engine"]) {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-adapter-test-"));
  const executable = path.join(directory, `${engine}.cjs`);
  await writeFile(executable, fixture, { mode: 0o700 });
  const profile: AgentProfile = { id: engine, name: engine, engine, executable, cwd: directory, model: "test-model" };
  const events: AgentEvent[] = [];
  const adapter = await createAgentAdapter(profile, (event) => events.push(event));
  t.after(async () => {
    adapter.close();
    await rm(directory, { recursive: true, force: true });
  });
  return {
    adapter,
    profile,
    events,
    trace: async () =>
      (await readFile(path.join(directory, "trace.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line))
  };
}

for (const engine of ["codex", "claude", "pi"] as const) {
  test(
    `${engine}: native handshake, streaming, approval and cancellation`,
    { skip: process.platform === "win32" },
    async (t) => {
      const { adapter, profile, events, trace } = await setup(t, engine);
      assert.match((await probeAgent(profile)).version, /fixture 1.0/);
      await adapter.send("complete");
      await waitFor(() => events.some((event) => event.type === "approval"));
      await assert.rejects(adapter.send("overlap"), /current agent turn/);
      const text = events.filter((event) => event.type === "text");
      assert.equal(text.length, 2);
      assert.equal(text[0].id, text[1].id);
      assert.equal(text[1].text, "Hello world");
      await adapter.approve("approve-1", true);
      await waitFor(() => events.filter((event) => event.status === "idle").length === 2);
      await assert.rejects(adapter.approve("approve-1", true), /no longer pending/);
      await adapter.send("cancel");
      await waitFor(() => events.filter((event) => event.status === "pending").length === 2);
      await adapter.stop();
      await waitFor(() => events.filter((event) => event.status === "idle").length === 3);
      assert.equal(events.filter((event) => event.status === "denied").length, 1);
      const messages = await trace();
      assert.ok(!JSON.stringify(messages[0].args).includes("mcp"), "Luna does not inject MCP configuration");
      if (engine === "codex") {
        const start = messages.find((m) => m.method === "thread/start");
        assert.equal(start.params.approvalPolicy, "untrusted");
        assert.equal(start.params.approvalsReviewer, "user");
        assert.ok(messages.some((m) => m.id === "approve-1" && m.result?.decision === "accept"));
        assert.ok(messages.some((m) => m.id === "approve-1" && m.result?.decision === "decline"));
        assert.deepEqual(messages[0].args, ["app-server"]);
        assert.equal(start.params.developerInstructions, undefined);
      } else if (engine === "claude") {
        assert.ok(!messages[0].args.includes("--strict-mcp-config"));
        assert.ok(!messages[0].args.includes("--setting-sources="));
        assert.ok(messages.some((m) => m.response?.response?.updatedInput?.command === "touch approved"));
        assert.ok(messages.some((m) => m.response?.response?.behavior === "deny"));
      } else {
        await waitFor(() => events.some((event) => event.status === "denied"));
        assert.ok(messages.some((m) => m.type === "clear_queue"));
        assert.ok(messages.some((m) => m.type === "abort"));
      }
    }
  );

  test(
    `${engine}: unexpected exit reports failure and ends the session`,
    { skip: process.platform === "win32" },
    async (t) => {
      const { adapter, events } = await setup(t, engine);
      await adapter.send("crash");
      await waitFor(() => events.some((event) => event.type === "error"));
      assert.ok(events.some((event) => event.text.includes("fatal native agent crash")));
      await assert.rejects(adapter.send("again"), /closed/);
    }
  );
}

test("malformed protocol output fails closed", { skip: process.platform === "win32" }, async (t) => {
  const { adapter, events } = await setup(t, "codex");
  await adapter.send("malformed");
  await waitFor(() => events.some((event) => event.text.includes("Invalid agent protocol")));
  await assert.rejects(adapter.send("again"), /closed/);
});

test("Windows npm shims resolve Node or native entries without a shell", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-shim-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const root = path.join(directory, "node_modules", "@openai", "codex");
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ bin: { codex: "cli.js" } }));
  await writeFile(path.join(root, "cli.js"), "");
  await writeFile(path.join(directory, "node.exe"), "");
  const executable = path.join(directory, "codex.cmd");
  await writeFile(executable, "@echo off");
  const profile: AgentProfile = { id: "test", name: "test", engine: "codex", executable, cwd: directory, model: "" };
  assert.deepEqual(await agentCommand(profile, "win32"), {
    command: path.join(directory, "node.exe"),
    args: [path.join(root, "cli.js")]
  });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ bin: { codex: "cli.exe" } }));
  await writeFile(path.join(root, "cli.exe"), "");
  assert.deepEqual(await agentCommand(profile, "win32"), { command: path.join(root, "cli.exe"), args: [] });
  await writeFile(path.join(root, "package.json"), JSON.stringify({ bin: { codex: "../../../escape.js" } }));
  await assert.rejects(agentCommand(profile, "win32"), /Unsupported Windows command shim/);
});

test("closing an agent terminates its local tool descendants", { skip: process.platform === "win32" }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "luna-tree-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const heartbeat = path.join(directory, "heartbeat");
  const grandchild = `process.on('SIGTERM',()=>{});setInterval(()=>require('node:fs').writeFileSync(${JSON.stringify(heartbeat)},String(Date.now())),20)`;
  const source = `const c=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});console.log(JSON.stringify({pid:c.pid}));setInterval(()=>{},1000);`;
  let childPid: number;
  const processAdapter = new AgentProcess(
    process.execPath,
    ["-e", source],
    directory,
    process.env,
    (message) => {
      childPid = message.pid;
    },
    () => {}
  );
  t.after(() => processAdapter.close());
  await waitFor(() => !!childPid);
  let before = "";
  const end = Date.now() + 3000;
  while (!before && Date.now() < end) {
    try {
      before = await readFile(heartbeat, "utf8");
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assert.ok(before, "tool descendant started");
  processAdapter.close();
  await new Promise((resolve) => setTimeout(resolve, 100));
  const stopped = await readFile(heartbeat, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(await readFile(heartbeat, "utf8"), stopped, "tool descendant stopped even though it ignored SIGTERM");
});

// Opt-in native CLI initialization; this never sends a model prompt.
for (const engine of ["codex", "claude", "pi"] as const) {
  const executable = process.env[`LUNA_${engine.toUpperCase()}_SMOKE_BIN`];
  test(`${engine}: real CLI initializes without Luna MCP setup`, { skip: !executable, timeout: 45_000 }, async (t) => {
    const profile: AgentProfile = { id: "smoke", name: "smoke", engine, executable, cwd: tmpdir(), model: "" };
    const events: AgentEvent[] = [];
    assert.ok((await probeAgent(profile)).version);
    const adapter = await createAgentAdapter(profile, (event) => events.push(event));
    t.after(() => adapter.close());
    assert.ok(events.some((event) => event.type === "status" && event.status === "idle"));
  });
}
