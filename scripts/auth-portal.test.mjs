import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { portalError } from '../src/utils/authPortal.ts';

test('staff can only use staff login, never a customer portal', () => {
  assert.equal(portalError('admin', 'admin'), null);
  assert.ok(portalError('admin', 'student'));
  assert.ok(portalError('admin', 'business'));
});

test('customers cannot log into staff portal or each other portal', () => {
  for (const role of ['student', 'business']) assert.ok(portalError(role, 'admin'));
  assert.ok(portalError('student', 'business'));
  assert.ok(portalError('business', 'student'));
  assert.equal(portalError('student', 'student'), null);
  assert.equal(portalError('business', 'business'), null);
});

test('recipient login can restore a shared link for any existing account role', () => {
  for (const role of ['student', 'business', 'admin']) assert.equal(portalError(role, 'recipient'), null);
});

test('staff route is separate and has no signup or role selection', () => {
  const screen = readFileSync(new URL('../src/screens/StaffLoginScreen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /signIn\(email, password, 'admin'\)/);
  assert.doesNotMatch(screen, /router\.(?:push|replace)\('\/register/);
  const layout = readFileSync(new URL('../src/app/admin/_layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /Redirect href="\/staff\/login"/);
});
