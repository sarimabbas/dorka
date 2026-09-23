import { describe, expect, it } from 'vitest'
import {
  bindHostIsNetworkExposed,
  describeDorkadBindExposure,
  DORKAD_LOOPBACK_BIND_HOST,
  DorkadBindAddressError,
  resolveDorkadBindHost
} from './dorkad-bind-address'

describe('resolveDorkadBindHost', () => {
  it('defaults to loopback when the operator asked for nothing', () => {
    expect(resolveDorkadBindHost()).toBe(DORKAD_LOOPBACK_BIND_HOST)
    expect(DORKAD_LOOPBACK_BIND_HOST).toBe('127.0.0.1')
  })

  it('accepts literal IPv4 and IPv6 addresses, including explicit wide binds', () => {
    expect(resolveDorkadBindHost('0.0.0.0')).toBe('0.0.0.0')
    expect(resolveDorkadBindHost('10.1.2.3')).toBe('10.1.2.3')
    expect(resolveDorkadBindHost('::1')).toBe('::1')
    expect(resolveDorkadBindHost('localhost')).toBe('127.0.0.1')
    expect(resolveDorkadBindHost(' 127.0.0.1 ')).toBe('127.0.0.1')
  })

  it('refuses hostnames, because DNS would decide which interface got bound', () => {
    expect(() => resolveDorkadBindHost('internal.example')).toThrow(DorkadBindAddressError)
    expect(() => resolveDorkadBindHost('')).toThrow(DorkadBindAddressError)
    expect(() => resolveDorkadBindHost('0.0.0.0:80')).toThrow(DorkadBindAddressError)
  })
})

describe('bindHostIsNetworkExposed', () => {
  it('separates local-only addresses from network-reachable ones', () => {
    expect(bindHostIsNetworkExposed('127.0.0.1')).toBe(false)
    expect(bindHostIsNetworkExposed('127.5.5.5')).toBe(false)
    expect(bindHostIsNetworkExposed('::1')).toBe(false)
    expect(bindHostIsNetworkExposed('0.0.0.0')).toBe(true)
    expect(bindHostIsNetworkExposed('::')).toBe(true)
    expect(bindHostIsNetworkExposed('10.1.2.3')).toBe(true)
  })

  it('says out loud when a deployment is reachable from the network', () => {
    expect(describeDorkadBindExposure('0.0.0.0')).toContain('reachable from the network')
    expect(describeDorkadBindExposure('127.0.0.1')).toContain('local only')
  })
})
