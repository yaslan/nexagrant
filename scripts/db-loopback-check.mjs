#!/usr/bin/env node
// FO-203: a `localhost` database URL whose port Postgres holds on 127.0.0.1 only.
//
// `docker run -p 127.0.0.1:P:5432` publishes P on IPv4. libpq and node-postgres
// try `localhost` as ::1 first; while nothing listens there they get "connection
// refused" and fall back to 127.0.0.1, so the gate passes. But [::1]:P belongs to
// nobody, and P (55xxx) sits in the ephemeral range (macOS 49152-65535, Linux
// 32768-60999): any process on the machine may get it. When one does, the client
// reaches that process instead, and psql stops with "received invalid response to
// SSL negotiation" (exit 2) without trying 127.0.0.1. Measured: fe-fb's FO-169
// push, tests/migration-owner-chain.live.test.ts:561 `expected 2 to be +0`.
//
// Refuses (exit 1) when 127.0.0.1:P answers as Postgres and another address
// `localhost` resolves to does not. Anything else exits 0: a URL that is not
// localhost, a port nothing answers on (the gate reports that itself), or a
// Postgres on both stacks (docker compose's :5433 publishes 0.0.0.0 and [::]).
// The password is never printed.
//
// Usage: node scripts/db-loopback-check.mjs [<url> ...]
// Without arguments: DATABASE_URL, DATABASE_URL_MIGRATE, DATABASE_URL_RLS_TEST
// from the environment, else from ./.env.
// Rollback: delete this file and its line in githooks/pre-push.
import dns from 'node:dns/promises'
import fs from 'node:fs'
import net from 'node:net'

const KEYS = ['DATABASE_URL', 'DATABASE_URL_MIGRATE', 'DATABASE_URL_RLS_TEST']
const TIMEOUT_MS = 1500
// SSLRequest: length 8, code 80877103. A Postgres answers with one byte, S or N.
const SSL_REQUEST = Buffer.from([0, 0, 0, 8, 4, 210, 22, 47])

function fromDotenv(key) {
  let text
  try {
    text = fs.readFileSync('.env', 'utf8')
  } catch {
    return undefined
  }
  let value
  for (const line of text.split('\n')) {
    if (line.startsWith(`${key}=`)) value = line.slice(key.length + 1).trim()
  }
  return value?.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
}

/** 'postgres' | 'other' (something answered, not a Postgres) | 'none' (refused or no answer). */
function probe(address, port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: address, port })
    let settled = false
    const done = (result) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(TIMEOUT_MS, () => done('none'))
    socket.once('error', () => done('none'))
    socket.once('connect', () => socket.write(SSL_REQUEST))
    socket.once('data', (buf) => done(buf.length === 1 && (buf[0] === 0x53 || buf[0] === 0x4e) ? 'postgres' : 'other'))
    socket.once('end', () => done('other'))
  })
}

async function check(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.hostname.toLowerCase() !== 'localhost') return null
  const port = Number(url.port || 5432)
  const target = `localhost:${port}${url.pathname}`
  if ((await probe('127.0.0.1', port)) !== 'postgres') return null
  let addresses
  try {
    addresses = (await dns.lookup('localhost', { all: true })).map((a) => a.address)
  } catch {
    return null
  }
  for (const address of addresses) {
    if (address === '127.0.0.1') continue
    const seen = await probe(address, port)
    if (seen !== 'postgres') {
      const what = seen === 'other' ? 'something that is not Postgres answers there' : 'nothing listens there'
      return `${target}: Postgres is on 127.0.0.1:${port} but not on [${address}]:${port} (${what}).`
    }
  }
  return null
}

const urls = process.argv.length > 2
  ? process.argv.slice(2)
  : KEYS.map((k) => process.env[k] || fromDotenv(k)).filter(Boolean)
// One line per host:port/db: DATABASE_URL and its _MIGRATE and _RLS_TEST siblings differ only in the user.
const problems = [...new Set((await Promise.all([...new Set(urls)].map(check))).filter(Boolean))]
if (problems.length > 0) {
  for (const p of problems) console.error(`db-loopback-check: ${p}`)
  console.error('  `localhost` is tried as ::1 first, and any process may take that port on ::1; psql then fails')
  console.error('  instead of falling back to 127.0.0.1 (FO-203). Write 127.0.0.1 instead of localhost in .env')
  console.error('  (DATABASE_URL and the DATABASE_URL_* lines), then `pnpm db:setup`. CLAUDE.md "Worktree\'de gate".')
  process.exit(1)
}
