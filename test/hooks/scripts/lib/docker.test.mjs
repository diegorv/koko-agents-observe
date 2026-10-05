// test/hooks/scripts/lib/docker.test.mjs
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { execFile } from 'node:child_process'
import { getJson } from '../../../../hooks/scripts/lib/http.mjs'
import {
  buildPortMapping,
  buildTranscriptMounts,
  buildDataMount,
  ensureImage,
  restartServer,
} from '../../../../hooks/scripts/lib/docker.mjs'

// restartServer drives docker via execFile and polls /health via getJson —
// both are mocked below (only the restartServer tests use them).
vi.mock('node:child_process', () => ({ execFile: vi.fn() }))
vi.mock('../../../../hooks/scripts/lib/http.mjs', () => ({ getJson: vi.fn() }))
vi.mock('../../../../hooks/scripts/lib/config.mjs', () => ({
  initLocalDataDirs: vi.fn(),
  getServerEnv: () => ({ AGENTS_OBSERVE_SERVER_PORT: '4981' }),
}))
vi.mock('../../../../hooks/scripts/lib/fs.mjs', () => ({
  saveServerPortFile: vi.fn(),
  removeServerPortFile: vi.fn(),
}))

describe('buildPortMapping (issue #22)', () => {
  it('prefixes the loopback bind host by default', () => {
    expect(buildPortMapping('127.0.0.1', 4981, 4981)).toBe('127.0.0.1:4981:4981')
  })

  it('supports auto-assign (host port 0) while keeping the loopback prefix', () => {
    expect(buildPortMapping('127.0.0.1', 0, 4981)).toBe('127.0.0.1:0:4981')
  })

  it('allows binding all interfaces for LAN access', () => {
    expect(buildPortMapping('0.0.0.0', 4981, 4981)).toBe('0.0.0.0:4981:4981')
  })

  it('omits the host prefix when bind host is empty (docker default)', () => {
    expect(buildPortMapping('', 4981, 4981)).toBe('4981:4981')
  })
})

describe('buildTranscriptMounts (issue #21)', () => {
  const alwaysExists = () => true
  const neverExists = () => false

  it('does NOT drop a Windows host path with a drive-letter colon', () => {
    // Regression: the old filter split the mount on ':' and mistook the
    // drive letter ("C") for the source, dropping both mounts on Windows.
    const mounts = buildTranscriptMounts(
      { claudeHost: 'C:\\Users\\me\\.claude\\projects', codexHost: '', enabled: true },
      alwaysExists,
    )
    expect(mounts).toEqual(['-v', 'C:\\Users\\me\\.claude\\projects:/host/.claude/projects:ro'])
  })

  it('mounts both agent classes on POSIX', () => {
    const mounts = buildTranscriptMounts(
      {
        claudeHost: '/home/me/.claude/projects',
        codexHost: '/home/me/.codex/sessions',
        enabled: true,
      },
      alwaysExists,
    )
    expect(mounts).toEqual([
      '-v',
      '/home/me/.claude/projects:/host/.claude/projects:ro',
      '-v',
      '/home/me/.codex/sessions:/host/.codex/sessions:ro',
    ])
  })

  it('skips a host path that does not exist', () => {
    const mounts = buildTranscriptMounts(
      {
        claudeHost: '/home/me/.claude/projects',
        codexHost: '/home/me/.codex/sessions',
        enabled: true,
      },
      (p) => p.includes('.claude'),
    )
    expect(mounts).toEqual(['-v', '/home/me/.claude/projects:/host/.claude/projects:ro'])
  })

  it('returns nothing when transcript stats are disabled', () => {
    expect(
      buildTranscriptMounts(
        {
          claudeHost: '/home/me/.claude/projects',
          codexHost: '/home/me/.codex/sessions',
          enabled: false,
        },
        alwaysExists,
      ),
    ).toEqual([])
  })

  it('returns nothing when no host path exists', () => {
    expect(
      buildTranscriptMounts(
        {
          claudeHost: '/home/me/.claude/projects',
          codexHost: '/home/me/.codex/sessions',
          enabled: true,
        },
        neverExists,
      ),
    ).toEqual([])
  })

  it('appends the shared SELinux relabel option (,z) when relabel is set (issue #20)', () => {
    const mounts = buildTranscriptMounts(
      {
        claudeHost: '/home/me/.claude/projects',
        codexHost: '/home/me/.codex/sessions',
        enabled: true,
        relabel: true,
      },
      alwaysExists,
    )
    expect(mounts).toEqual([
      '-v',
      '/home/me/.claude/projects:/host/.claude/projects:ro,z',
      '-v',
      '/home/me/.codex/sessions:/host/.codex/sessions:ro,z',
    ])
  })
})

describe('buildDataMount (issue #20)', () => {
  it('mounts the data dir at /data without a relabel option by default', () => {
    expect(buildDataMount('/home/me/.koko-agents-observe/data')).toBe(
      '/home/me/.koko-agents-observe/data:/data',
    )
  })

  it('appends the SELinux relabel option (:z) when relabel is set', () => {
    expect(buildDataMount('/home/me/.koko-agents-observe/data', true)).toBe(
      '/home/me/.koko-agents-observe/data:/data:z',
    )
  })

  it('does not relabel when relabel is false', () => {
    expect(buildDataMount('/home/me/.koko-agents-observe/data', false)).toBe(
      '/home/me/.koko-agents-observe/data:/data',
    )
  })
})

describe('ensureImage', () => {
  const log = { info() {}, error() {} }
  const image = 'koko-agents-observe:local'

  // Fake executor: records calls, answers per docker subcommand.
  function fakeExec(results) {
    const calls = []
    const exec = async (cmd, args) => {
      calls.push(args.slice(0, 2).join(' '))
      return results[args[0] === 'image' ? 'inspect' : args[0]]
    }
    return { exec, calls }
  }

  it('uses a locally present image without pulling', async () => {
    const { exec, calls } = fakeExec({ inspect: { ok: true } })
    expect(await ensureImage({ dockerImage: image }, log, exec)).toBe(true)
    expect(calls).toEqual(['image inspect'])
  })

  it('pulls when the image is not present locally', async () => {
    const { exec, calls } = fakeExec({ inspect: { ok: false }, pull: { ok: true } })
    expect(await ensureImage({ dockerImage: image }, log, exec)).toBe(true)
    expect(calls).toEqual(['image inspect', 'pull koko-agents-observe:local'])
  })

  it('fails when the image is neither local nor pullable', async () => {
    const { exec } = fakeExec({ inspect: { ok: false }, pull: { ok: false, stderr: 'denied' } })
    expect(await ensureImage({ dockerImage: image }, log, exec)).toBe(false)
  })

  it('skips docker entirely in the test harness', async () => {
    const { exec, calls } = fakeExec({})
    expect(await ensureImage({ dockerImage: image, testSkipPull: true }, log, exec)).toBe(true)
    expect(calls).toEqual([])
  })
})

describe('restartServer', () => {
  const log = { info() {}, warn() {}, error() {} }
  const config = {
    API_ID: 'koko-agents-observe',
    apiBaseUrl: 'http://127.0.0.1:4981/api',
    containerName: 'koko-agents-observe',
    dockerLabel: 'koko-agents-observe',
    dockerImage: 'koko-agents-observe:local',
    expectedVersion: '1.2.0',
    serverPort: 4981,
    serverBindHost: '127.0.0.1',
    dataDir: '/tmp/koko-test/data',
  }

  // Stateful fake docker: one container (ours) that is running or stopped.
  // /health answers OK only while the fake container is running.
  let container
  let calls

  beforeEach(() => {
    calls = []
    execFile.mockImplementation((cmd, args, opts, cb) => {
      calls.push(args.slice(0, 2).join(' '))
      const ok = (stdout = '') => cb(null, stdout, '')
      const fail = (stderr = 'error') =>
        cb(Object.assign(new Error(stderr), { code: 1 }), '', stderr)
      const [sub] = args
      if (sub === 'info') return ok()
      if (sub === 'image') return ok()
      if (sub === 'inspect') {
        if (!container) return fail('No such container')
        const format = args[2] || ''
        if (format.includes('Labels')) return ok(container.label)
        if (format.includes('State.Running')) return ok(String(container.running))
        return ok('[]')
      }
      if (sub === 'stop') {
        if (container) container.running = false
        return ok()
      }
      if (sub === 'rm') {
        container = null
        return ok()
      }
      if (sub === 'start') {
        container.running = true
        return ok()
      }
      if (sub === 'run') {
        container = { label: config.expectedVersion, running: true }
        return ok('new-container-id')
      }
      return fail(`unexpected docker ${sub}`)
    })
    getJson.mockImplementation(async () =>
      container?.running
        ? { status: 200, body: { ok: true, id: config.API_ID, version: config.expectedVersion } }
        : { status: 0, error: 'connection refused' },
    )
  })

  it('recreates a healthy running container instead of reporting "already running"', async () => {
    container = { label: config.expectedVersion, running: true }
    expect(await restartServer(config, log)).toBe(4981)
    expect(calls).toContain('stop koko-agents-observe')
    expect(calls).toContain('rm -f')
    expect(calls).toContain('run -d')
    expect(calls.indexOf('rm -f')).toBeLessThan(calls.indexOf('run -d'))
  })

  it('does not reuse a stopped container via docker start', async () => {
    container = { label: config.expectedVersion, running: false }
    expect(await restartServer(config, log)).toBe(4981)
    expect(calls).toContain('rm -f')
    expect(calls).toContain('run -d')
    expect(calls).not.toContain('start koko-agents-observe')
  })

  it('starts fresh when no container exists', async () => {
    container = null
    expect(await restartServer(config, log)).toBe(4981)
    expect(calls).not.toContain('rm -f')
    expect(calls).toContain('run -d')
  })

  it('leaves a container it does not manage alone', async () => {
    container = { label: '', running: true }
    expect(await restartServer(config, log)).toBe('4981')
    expect(calls).not.toContain('stop koko-agents-observe')
    expect(calls).not.toContain('rm -f')
    expect(calls).not.toContain('run -d')
  })
})
