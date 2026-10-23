#!/usr/bin/env node
// Read-only inventory: never execute a listed command or decide what CI may skip.
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checksFrom, planFor, risks } from './check-catalog.mjs';
import { scriptInventory } from './script-inventory.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const usage = `用法：pnpm checks --list [--json]
      pnpm checks --risk=save,input [--json]
      pnpm checks --scripts [--kind=archive|review|diagnostic|support|tool|check|ci] [--json]
风险：${Object.entries(risks).map(([id, risk]) => `${id}（${risk.title}）`).join('、')}
只列出检查与前置条件，不运行命令、不替代 CI、不自动判断改动影响面。`;

try {
  const options = { json: false, list: false, scripts: false };
  for (const arg of process.argv.slice(2)) {
    if (arg === '--help' || arg === '-h') { console.log(usage); process.exit(0); }
    if (['--json', '--list', '--scripts'].includes(arg)) {
      if (options[arg.slice(2)]) throw Error(`重复参数：${arg}`);
      options[arg.slice(2)] = true;
    } else if (arg.startsWith('--risk=') || arg.startsWith('--kind=')) {
      const at = arg.indexOf('='), key = arg.slice(2, at), value = arg.slice(at + 1);
      if (!value || options[key]) throw Error(`无效或重复参数：${arg}`);
      options[key] = value;
    } else throw Error(`未知参数：${arg}`);
  }
  if (options.scripts && (options.risk || options.list)) throw Error('--scripts 不能与 --risk/--list 同用');
  if (options.kind && !options.scripts) throw Error('--kind 只用于 --scripts，不能过滤掉必跑测试');
  if (!options.list && !options.risk && !options.scripts) throw Error(usage);
  const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts;
  const checks = checksFrom(scripts);
  let result;
  if (options.scripts) {
    const files = readdirSync(resolve(root, 'scripts'), { recursive: true, withFileTypes: true })
      .filter(e => e.isFile() && /\.(mjs|js|ts|py|sh)$/.test(e.name))
      .map(e => relative(root, resolve(e.parentPath, e.name)).replaceAll('\\', '/')).sort();
    let inventory = scriptInventory(files, scripts);
    if (options.kind) {
      if (!['archive', 'review', 'diagnostic', 'support', 'tool', 'check', 'ci'].includes(options.kind)) throw Error(`未知类别：${options.kind}`);
      inventory = inventory.filter(item => item.kind === options.kind);
    }
    result = { mode: 'scripts', scripts: inventory };
  } else if (options.risk) {
    const selected = options.risk.split(',');
    if (selected.some(id => !id || id !== id.trim())) throw Error('风险名不能为空或带空格');
    result = { mode: 'risk', ...planFor(selected, checks) };
  } else result = { mode: 'list', checks };
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log('检查导航（仅列出；未运行任何检查，CI 策略不变）');
    if (result.scripts) {
      for (const item of result.scripts) console.log(`[${item.kind}] ${item.path}\n  ${item.reason}${item.commands?.length ? `\n  package: ${item.commands.join(', ')}` : ''}`);
    } else {
      for (const check of result.checks) {
        console.log(`\n[${check.kind}${check.ci ? ` / CI ${check.ci}` : ' / 手动'}] ${check.command} — ${check.purpose}`);
        console.log(`  实际命令：${check.script}`);
        for (const item of check.prerequisites) console.log(`  前置：${item}`);
        if (check.manualReason) console.log(`  边界：${check.manualReason}`);
        if (check.evidence) console.log(`  读结果：${check.evidence}`);
        if (check.output) console.log(`  默认输出：${check.output}`);
      }
      if (result.diagnostics?.length) {
        console.log('\n另行诊断（不计入必跑回归，也不代表 PASS）：');
        for (const check of result.diagnostics) console.log(`  ${check.command} — ${check.evidence}`);
      }
      if (result.evidence?.length) console.log('\n需要记录的验收证据：\n' + result.evidence.map(item => `- ${item}`).join('\n'));
    }
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
