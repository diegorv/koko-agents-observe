// test/hooks/scripts/hook-wrapper.test.mjs
// Verifies the bash wrapper (hook.sh) drains stdin, leaves a breadcrumb in
// ~/.koko-agents-observe/logs/hook.log and still exits 0 when node is missing
// or the CLI script is unreadable.

import { describe, test, expect, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  symlinkSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const HOOK_SH = resolve(import.meta.dirname, '../../../hooks/scripts/hook.sh')

// Resolve bash by absolute path so the spawn itself doesn't depend on PATH.
const BASH = existsSync('/bin/bash') ? '/bin/bash' : '/usr/bin/bash'

// External commands hook.sh needs besides node. On Linux node often lives in
// /usr/bin next to these, so PATH=/bin:/usr/bin would not hide it — instead we
// build a bin dir that contains only these tools.
const TOOLS = ['cat', 'dirname', 'date', 'mkdir']

let tempRoots = []

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function makeSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'hook-sh-'))
  tempRoots.push(root)
  return root
}

function makeBinWithoutNode(root) {
  const bin = join(root, 'bin')
  mkdirSync(bin)
  for (const tool of TOOLS) {
    const src = ['/bin', '/usr/bin'].map((d) => join(d, tool)).find((p) => existsSync(p))
    if (!src) throw new Error(`${tool} not found in /bin or /usr/bin`)
    symlinkSync(src, join(bin, tool))
  }
  return bin
}

function runHook(script, { home, path, input = '{}' }) {
  return execFileSync(BASH, [script], {
    input,
    env: { HOME: home, PATH: path },
    encoding: 'utf8',
  })
}

function readHookLog(home) {
  return readFileSync(join(home, '.koko-agents-observe/logs/hook.log'), 'utf8')
}

describe('hook.sh wrapper', () => {
  test('logs a breadcrumb and exits 0 when node is missing from PATH', () => {
    const home = makeSandbox()
    const path = makeBinWithoutNode(home)

    // execFileSync throws on non-zero exit — not throwing proves exit 0.
    expect(() => runHook(HOOK_SH, { home, path })).not.toThrow()
    expect(readHookLog(home)).toMatch(/hook\.sh: node not found in PATH/)
  })

  test('logs a breadcrumb and exits 0 when observe_cli.mjs is missing', () => {
    const home = makeSandbox()
    // Copy hook.sh into a dir with no observe_cli.mjs — a corrupt install.
    const scriptDir = join(home, 'scripts')
    mkdirSync(scriptDir)
    const hook = join(scriptDir, 'hook.sh')
    writeFileSync(hook, readFileSync(HOOK_SH, 'utf8'))

    // Sandbox bin with node linked in: node is available, only the CLI is missing.
    const path = makeBinWithoutNode(home)
    symlinkSync(process.execPath, join(path, 'node'))
    expect(() => runHook(hook, { home, path })).not.toThrow()
    expect(readHookLog(home)).toMatch(/observe_cli\.mjs missing or unreadable at /)
  })

  test('drains a large stdin payload before exiting on failure', () => {
    const home = makeSandbox()
    const path = makeBinWithoutNode(home)
    // Larger than a pipe buffer: if the wrapper exited without reading stdin
    // the write side would fail with EPIPE.
    const input = JSON.stringify({ payload: 'x'.repeat(1024 * 1024) })

    expect(() => runHook(HOOK_SH, { home, path, input })).not.toThrow()
    expect(readHookLog(home)).toMatch(/node not found in PATH/)
  })
})
