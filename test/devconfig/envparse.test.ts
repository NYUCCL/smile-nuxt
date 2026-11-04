// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseEnv } from '../../src/devconfig/envparse'

describe('parseEnv (dotenv-compatible)', () => {
  it('reads aligned KEY = value lines, as the starter writes them', () => {
    const env = parseEnv('# comment\nVITE_COLOR_MODE                  = light\nVITE_MAX_WRITES = 1000\n')
    expect(env).toEqual({ VITE_COLOR_MODE: 'light', VITE_MAX_WRITES: '1000' })
  })

  it('ignores commented-out settings and inline comments', () => {
    const env = parseEnv('#   SMILE_DEV_TOOLS = include\nSMILE_DEV_ACCESS=password # deploys only\n')
    expect(env).toEqual({ SMILE_DEV_ACCESS: 'password' })
  })

  it('strips quotes, expands \\n only in double quotes, and handles export', () => {
    const env = parseEnv('export A="x\\ny"\nB=\'x\\ny\'\nC=`z`\nD="has # hash"\n')
    expect(env).toEqual({ A: 'x\ny', B: 'x\\ny', C: 'z', D: 'has # hash' })
  })

  it('handles CRLF, empty values and a missing final newline', () => {
    expect(parseEnv('A=1\r\nB=\r\nC=3')).toEqual({ A: '1', B: '', C: '3' })
  })

  it('lets the last assignment win', () => {
    expect(parseEnv('A=1\nA=2\n')).toEqual({ A: '2' })
  })
})
