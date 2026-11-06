import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
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
let prompt = '', input, confirmResolve, mcpName;
const hooks = {};
const finish = () => {
  if (engine === 'codex') out({ method:'turn/completed', params:{ turn:{id:'turn-1',status:'completed'} } });
  if (engine === 'claude') out({ type:'result', subtype:'success', is_error:false });
  if (engine === 'pi') out({ type:'agent_settled', aborted:prompt !== 'complete' });
};
async function initialize() {
  if(engine === 'codex') {
    mcpName = /^mcp_servers\.([^ ]+) = /.exec(process.argv.find(arg=>arg.startsWith('mcp_servers.')))[1];
  }
  if(engine === 'claude') {
    const mcp = JSON.parse(fs.readFileSync(process.argv[process.argv.indexOf('--mcp-config') + 1], 'utf8'));
    mcpName = Object.keys(mcp.mcpServers)[0]; trace({ mcp });
  }
  if(engine === 'pi') {
    const source = fs.readFileSync(process.argv[process.argv.indexOf('-e') + 1], 'utf8');
    const extension = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
    extension.default({ registerMcpServer:(name,config)=>{mcpName=name;trace({name,config});}, on:(name,fn)=>{hooks[name]=fn;} });
    hooks.session_start({}, {ui:{ notify:(message)=>out({type:'extension_ui_request', id:'ready', method:'notify', message}) }});
  }
}
function approval() {
  if(engine === 'codex' && prompt.endsWith('-elicitation')) {
    const request = prompt === 'url-elicitation'
      ? {mode:'url',url:'https://example.com/authorize',elicitationId:'form-1'}
      : {mode:'form',requestedSchema:{type:'object',properties:{confirm:{type:'boolean'}},required:['confirm']}};
    out({id:'approve-1',method:'mcpServer/elicitation/request',params:{
      threadId:'thread-1',turnId:'turn-1',serverName:prompt==='other-elicitation'?'user_server':mcpName,
      message:'Complete this MCP form',_meta:null,...request
    }});
    return;
  }
  const toolName = prompt === 'owned-mcp' ? 'mcp__' + mcpName + '__execute_command'
    : prompt === 'other-mcp' ? 'mcp__user_server__execute_command'
    : prompt === 'lookalike-mcp' ? 'mcp__' + mcpName + '_other__execute_command'
    : engine === 'claude' ? 'Bash' : 'bash';
  if (engine === 'codex') out({id:'approve-1',method:'item/commandExecution/requestApproval',params:{command:'touch approved',cwd:process.cwd()}});
  if (engine === 'claude') out({type:'control_request',request_id:'approve-1',request:{subtype:'can_use_tool',tool_name:toolName,input:{command:'touch approved'}}});
  if (engine === 'pi') {
    hooks.tool_call({toolName,input:{command:'touch approved'}},{hasUI:true,ui:{confirm:(title,message)=>new Promise(resolve=>{
      confirmResolve=resolve;out({type:'extension_ui_request',id:'approve-1',method:'confirm',title,message});
    })}}).then(result=>{trace({gate: result || {allowed:true}});if(prompt.endsWith('-mcp'))finish();});
  }
}
function started(text) {
  prompt = text;
  if(text === 'crash') { process.stderr.write('fatal test-token'); process.exit(9); }
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
      else if(m.id === 'approve-1' && (prompt === 'complete' || prompt.endsWith('-elicitation'))) finish();
    }
    if(engine === 'claude') {
      if(m.type === 'control_request') {out({type:'control_response',response:{subtype:'success',request_id:m.request_id,response:{}}});if(m.request.subtype==='interrupt')finish();}
      if(m.type === 'user') started(m.message.content);
      if(m.type === 'control_response' && (prompt === 'complete' || prompt.endsWith('-mcp'))) finish();
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
  const adapter = await createAgentAdapter(
    profile,
    { url: "http://127.0.0.1:12345/mcp", headers: { Authorization: "test-token" } },
    (event) => events.push(event)
  );
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
      assert.ok(!JSON.stringify(messages[0].args).includes("test-token"), "credentials stay out of process arguments");
      if (engine === "codex") {
        const start = messages.find((m) => m.method === "thread/start");
        assert.equal(start.params.approvalPolicy, "untrusted");
        assert.equal(start.params.approvalsReviewer, "user");
        assert.ok(messages.some((m) => m.id === "approve-1" && m.result?.decision === "accept"));
        assert.ok(messages.some((m) => m.id === "approve-1" && m.result?.decision === "decline"));
        assert.ok(messages[0].args.some((arg: string) => arg.includes("env_http_headers")));
        const overrides = messages[0].args.filter((_: string, index: number) => messages[0].args[index - 1] === "-c");
        assert.equal(overrides.length, 1, "only the injected MCP server gets a policy override");
        assert.match(overrides[0], /^mcp_servers\.luna_[a-f0-9]{32} = \{.*default_tools_approval_mode = "approve"/);
      } else if (engine === "claude") {
        assert.equal(
          Object.values(messages.find((m) => m.mcp).mcp.mcpServers)[0]["headers"].Authorization,
          "test-token"
        );
        assert.ok(messages.some((m) => m.response?.response?.updatedInput?.command === "touch approved"));
        assert.ok(messages.some((m) => m.response?.response?.behavior === "deny"));
      } else {
        assert.equal(messages.find((m) => m.config).config.headers.Authorization, "test-token");
        await waitFor(() => events.some((event) => event.status === "denied"));
        assert.ok(messages.some((m) => m.type === "clear_queue"));
        assert.ok(messages.some((m) => m.type === "abort"));
      }
    }
  );

  test(
    `${engine}: unexpected exit redacts credentials and ends the session`,
    { skip: process.platform === "win32" },
    async (t) => {
      const { adapter, events } = await setup(t, engine);
      await adapter.send("crash");
      await waitFor(() => events.some((event) => event.type === "error"));
      assert.ok(!JSON.stringify(events).includes("test-token"));
      assert.ok(events.some((event) => event.text.includes("[redacted]")));
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

test(
  "Codex still declines MCP forms and URL flows from owned and other servers",
  { skip: process.platform === "win32" },
  async (t) => {
    const { adapter, events, trace } = await setup(t, "codex");
    let idleCount = 1;
    for (const prompt of ["owned-elicitation", "other-elicitation", "url-elicitation"]) {
      await adapter.send(prompt);
      idleCount += 1;
      await waitFor(() => events.filter((event) => event.status === "idle").length === idleCount);
    }
    assert.equal(events.filter((event) => event.type === "approval").length, 0);
    const replies = (await trace()).filter((message) => message.id === "approve-1");
    assert.equal(replies.length, 3);
    for (const reply of replies) assert.deepEqual(reply.result, { action: "decline", content: null, _meta: null });
  }
);

for (const engine of ["claude", "pi"] as const) {
  test(
    `${engine}: only the exact host-proxied MCP server avoids a second approval`,
    { skip: process.platform === "win32" },
    async (t) => {
      const { adapter, events, trace } = await setup(t, engine);
      await adapter.send("owned-mcp");
      await waitFor(() => events.filter((event) => event.status === "idle").length === 2);
      assert.equal(events.filter((event) => event.type === "approval").length, 0);
      const recorded = await trace();
      assert.ok(
        engine === "claude"
          ? recorded.some((message) => message.response?.response?.behavior === "allow")
          : recorded.some((message) => message.gate?.allowed === true)
      );
      for (const prompt of ["other-mcp", "lookalike-mcp"]) {
        const before = events.filter((event) => event.type === "approval" && event.status === "pending").length;
        await adapter.send(prompt);
        await waitFor(
          () => events.filter((event) => event.type === "approval" && event.status === "pending").length > before
        );
        await adapter.approve("approve-1", false);
        await waitFor(
          () => events.filter((event) => event.status === "idle").length === (prompt === "other-mcp" ? 3 : 4)
        );
      }
      assert.equal(events.filter((event) => event.type === "approval" && event.status === "denied").length, 2);
    }
  );
}

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
    () => {},
    (message) => message
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

// Opt-in real CLI smoke: set LUNA_CODEX_SMOKE_BIN / LUNA_CLAUDE_SMOKE_BIN /
// LUNA_PI_SMOKE_BIN to installed CLI paths. This never sends a model prompt.
for (const engine of ["codex", "claude", "pi"] as const) {
  const executable = process.env[`LUNA_${engine.toUpperCase()}_SMOKE_BIN`];
  test(
    `${engine}: real CLI discovers authenticated native MCP tools`,
    { skip: !executable, timeout: 45_000 },
    async (t) => {
      const requests: { method: string; authorized: boolean }[] = [];
      const server = createServer(async (request, response) => {
        if (request.method !== "POST") {
          response.writeHead(405).end();
          return;
        }
        let body = "";
        for await (const chunk of request) body += chunk;
        const message = JSON.parse(body);
        requests.push({ method: message.method, authorized: request.headers.authorization === "Bearer native-smoke" });
        if (message.id === undefined) {
          response.writeHead(202).end();
          return;
        }
        const result =
          message.method === "initialize"
            ? {
                protocolVersion: message.params.protocolVersion,
                capabilities: { tools: {} },
                serverInfo: { name: "luna-native-smoke", version: "1" }
              }
            : message.method === "tools/list"
              ? { tools: [] }
              : {};
        response
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", id: message.id, result }));
      });
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      t.after(() => {
        server.closeAllConnections();
        server.close();
      });
      const profile: AgentProfile = { id: "smoke", name: "smoke", engine, executable, cwd: tmpdir(), model: "" };
      assert.ok((await probeAgent(profile)).version);
      const adapter = await createAgentAdapter(
        profile,
        {
          url: `http://127.0.0.1:${(server.address() as any).port}/mcp`,
          headers: { Authorization: "Bearer native-smoke" }
        },
        () => {}
      );
      t.after(() => adapter.close());
      await waitFor(() => requests.some((request) => request.method === "tools/list"), 15_000);
      assert.ok(requests.some((request) => request.method === "initialize"));
      assert.ok(requests.every((request) => request.authorized));
    }
  );
}
