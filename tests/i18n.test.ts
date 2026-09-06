import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const tr = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/tr.json'), 'utf-8'))
const en = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'messages/en.json'), 'utf-8'))

function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = []
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value as Record<string, unknown>, fullKey))
    } else {
      keys.push(fullKey)
    }
  }
  return keys
}

describe('i18n', () => {
  const trKeys = flattenKeys(tr).sort()
  const enKeys = flattenKeys(en).sort()

  it('Turkish and English have same keys', () => {
    const trSet = new Set(trKeys)
    const enSet = new Set(enKeys)

    // Check all TR keys exist in EN
    for (const key of trKeys) {
      expect(enSet.has(key), `TR key missing in EN: ${key}`).toBe(true)
    }

    // Check all EN keys exist in TR
    for (const key of enKeys) {
      expect(trSet.has(key), `EN key missing in TR: ${key}`).toBe(true)
    }
  })

  it('All keys have non-empty translations', () => {
    for (const key of trKeys) {
      const keys = key.split('.')
      let val: unknown = tr
      for (const k of keys) {
        val = (val as Record<string, unknown>)[k]
      }
      expect(typeof val === 'string' && val.length > 0, `TR key ${key} is empty`).toBe(true)
    }

    for (const key of enKeys) {
      const keys = key.split('.')
      let val: unknown = en
      for (const k of keys) {
        val = (val as Record<string, unknown>)[k]
      }
      expect(typeof val === 'string' && val.length > 0, `EN key ${key} is empty`).toBe(true)
    }
  })

  it('Turkish translations are not just English copies', () => {
    let samePairs = 0
    for (const key of trKeys) {
      const keys = key.split('.')
      let trVal: unknown = tr
      let enVal: unknown = en
      for (const k of keys) {
        trVal = (trVal as Record<string, unknown>)[k]
        enVal = (enVal as Record<string, unknown>)[k]
      }
      if (trVal === enVal) {
        samePairs++
      }
    }
    // Allow up to 10% untranslated (proper nouns, technical terms, etc.)
    expect(samePairs).toBeLessThan(Math.ceil(trKeys.length * 0.1))
  })

  it('Should have minimum number of keys', () => {
    expect(trKeys.length).toBeGreaterThanOrEqual(50)
    expect(enKeys.length).toBeGreaterThanOrEqual(50)
  })
})
