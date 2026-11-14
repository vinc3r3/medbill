// Shared helpers for the browser checks: temporary users (admin API) and signing in through the real form.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), true);
const { createClient } = require('@supabase/supabase-js');

let admin = null;
const adminClient = () =>
  (admin ??= createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } }));

/** A confirmed throwaway user. Delete it with deleteTestUser (its cases go with it). */
export async function createTestUser(label = 'e2e') {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.com`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await adminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createTestUser: ${error.message}`);
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(userOrEmail) {
  let id = typeof userOrEmail === 'object' ? userOrEmail.id : null;
  if (!id) {
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 1000 });
    id = data?.users.find((u) => u.email === userOrEmail)?.id ?? null;
  }
  if (id) await adminClient().auth.admin.deleteUser(id);
}

/** Signs in through /signin and waits until the app is shown. */
export async function signIn(page, baseUrl, user) {
  await page.goto(`${baseUrl}/signin`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/signin'), { timeout: 30_000 });
}

/** Opens the new-check page and waits until React has hydrated the forms (so file inputs and buttons work). */
export async function openHome(page, baseUrl) {
  await page.goto(`${baseUrl}/new`);
  await page.locator('[data-testid="upload-form"][data-ready]').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="profile-form"][data-ready]').waitFor({ timeout: 30_000 });
}
