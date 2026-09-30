// test/hooks/scripts/lib/docker.test.mjs
import { describe, it, expect } from 'vitest'
import {
  buildPortMapping,
  buildTranscriptMounts,
  buildDataMount,
} from '../../../../hooks/scripts/lib/docker.mjs'

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
    expect(buildDataMount('/home/me/.agents-observe/data')).toBe(
      '/home/me/.agents-observe/data:/data',
    )
  })

  it('appends the SELinux relabel option (:z) when relabel is set', () => {
    expect(buildDataMount('/home/me/.agents-observe/data', true)).toBe(
      '/home/me/.agents-observe/data:/data:z',
    )
  })

  it('does not relabel when relabel is false', () => {
    expect(buildDataMount('/home/me/.agents-observe/data', false)).toBe(
      '/home/me/.agents-observe/data:/data',
    )
  })
})
