import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ADINALS_ENVIRONMENT,
  ADINALS_NAMESPACE,
  COLLECTION_PUBLISH_ENABLED,
  LIFECYCLE_PUBLISH_ENABLED,
} from './environment.ts'

test('the application defaults to production with product writes enabled', () => {
  assert.equal(ADINALS_ENVIRONMENT, 'production')
  assert.equal(ADINALS_NAMESPACE.app, 'adinals')
  assert.equal(ADINALS_NAMESPACE.basket, 'adinals')
  assert.equal(COLLECTION_PUBLISH_ENABLED, true)
  assert.equal(LIFECYCLE_PUBLISH_ENABLED, true)
})
