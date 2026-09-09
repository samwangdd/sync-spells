// Run after npm run build; requires an authenticated kiro-cli with --v3 and glab.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { toJson } = require('../dist/lib/agent');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'spells-kiro-permissions-'));
const agentDir = path.join(root, '.kiro', 'agents');
fs.mkdirSync(agentDir, { recursive: true });
const profile = JSON.parse(toJson(
  { name: 'sync-permissions-probe', description: 'Permission regression probe', tools: 'Bash', model: 'haiku' },
  'Execute only the exact harmless commands requested, using the shell tool. Do not inspect files or use MCP. If a command is denied, report that and continue with the remaining commands.',
));
// 验证生成器的权限，不加载用户角色指令或外部 MCP；权限字段保持原始生成结果。
profile.resources = [];
profile.includeMcpJson = false;
const profilePath = path.join(agentDir, 'sync-permissions-probe.json');
fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
const deniedCommand = "python3 -c 'print(123)'";
const allowedPush = 'git push --follow-tags --dry-run';
const deniedPush = 'git push --force --dry-run';
const commands = ['pwd', 'git --version', 'glab --version', deniedCommand, allowedPush, deniedPush];
console.log(`Runtime evidence: ${root}`);
const result = spawnSync('kiro-cli', [
  'chat', '--v3', '--agent', profile.name, '--output-format', 'stream-json',
  // 会话 allow 模拟用户批准 glab；agent deny 必须仍优先，不能用 trust-all 绕过验证。
  '--trust-tools', 'shell',
  `Execute each of these commands as a separate shell tool call, exactly as written: ${commands.join('; ')}. Do not combine commands or change directory. This temporary directory is not a Git repository, and both push probes use --dry-run, so neither can publish changes. The Python command only prints a number; do not run any other Python command.`,
], { cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 16 * 1024 * 1024 });
fs.writeFileSync(path.join(root, 'events.jsonl'), result.stdout || '');
fs.writeFileSync(path.join(root, 'stderr.log'), result.stderr || '');
assert.ifError(result.error);
assert.equal(result.status, 0, `Kiro exited ${result.status}; see ${root}`);
const updates = result.stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line))
  .map((event) => event.data?.update).filter(Boolean);
for (const command of commands) {
  const call = updates.find((update) => update.sessionUpdate === 'tool_call' && update.rawInput?.command === command);
  assert.ok(call, `No exact shell call for ${command}; see ${root}`);
  const outcome = updates.find((update) => update.toolCallId === call.toolCallId
    && update.sessionUpdate === 'tool_call_update' && ['completed', 'failed'].includes(update.status));
  assert.ok(outcome, `No terminal result for ${command}`);
  const denied = command === deniedCommand || command === deniedPush;
  if (denied) {
    assert.equal(outcome._meta?.kiro?.policyDenial?.effect, 'deny');
    assert.equal(outcome._meta?.kiro?.policyDenial?.source, 'agent-profile');
  } else if (command === allowedPush) {
    assert.equal(outcome._meta?.kiro?.policyDenial, undefined, '--follow-tags was denied');
    assert.match(JSON.stringify(outcome.rawOutput), /not a git repository/i);
  } else {
    assert.equal(outcome.status, 'completed', `${command}: ${JSON.stringify(outcome.rawOutput)}`);
    assert.match(JSON.stringify(outcome.rawOutput), /Exit Code: 0/);
  }
  console.log(`PASS ${command}: ${denied ? 'agent deny retained' : 'executed'}`);
}
// Kiro 启动时可能回写迁移结果，检查回写后的配置以捕捉孤立通配符复发。
const loaded = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
assert.deepEqual(loaded, profile, 'Kiro rewrote the generated profile during loading');
assert.ok(loaded.permissions?.rules?.length, 'Native permissions missing after Kiro load');
for (const rule of loaded.permissions.rules) {
  if (rule.capability === 'shell' && rule.effect === 'deny') {
    assert.ok(!rule.match?.includes('*'), 'Kiro migration introduced a catch-all shell deny');
  }
}
console.log('PASS generated profile survives Kiro loading without a catch-all shell deny');
