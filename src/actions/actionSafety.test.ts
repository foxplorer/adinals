import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('rehearsal sources have no broadcast, internalization, or network path', async () => {
  const [actionSource, signingSource, lifecycleSource] = await Promise.all([
    readFile(new URL('./index.ts', import.meta.url), 'utf8'),
    readFile(new URL('../wallet/actionSigning.ts', import.meta.url), 'utf8'),
    readFile(new URL('./lifecycle.ts', import.meta.url), 'utf8'),
  ])

  assert.equal(/sendWith\s*:/.test(actionSource), false)
  assert.equal(/sendWith\s*:/.test(signingSource), false)
  assert.equal(/sendWith\s*:/.test(lifecycleSource), false)
  assert.equal(/internalizeAction\s*\(/.test(lifecycleSource), false)
  assert.match(signingSource, /signAction[\s\S]*abortAction/)
  assert.equal(/fetch\s*\(/.test(lifecycleSource), false)
  assert.ok((actionSource.match(/noSend:\s*true/g) ?? []).length >= 2)
  assert.ok((signingSource.match(/noSend:\s*true/g) ?? []).length >= 1)
  assert.ok((lifecycleSource.match(/noSend:\s*true/g) ?? []).length >= 4)
})
