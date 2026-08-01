import assert from 'node:assert/strict'
import test from 'node:test'
import { ORDLOCK_PURCHASE_UNLOCKING_SCRIPT_MAX } from './ordLockLimits.ts'

test('OrdLock purchase bound covers the observed Yours template vector', () => {
  assert.ok(ORDLOCK_PURCHASE_UNLOCKING_SCRIPT_MAX >= 2_666)
  assert.ok(ORDLOCK_PURCHASE_UNLOCKING_SCRIPT_MAX <= 4_096)
})
