import { expect, test } from '@playwright/test';

// U1 smoke contract (tasks 1.2): the routes a user can actually reach without
// credentials must load, and a protected route must never mount its page.
// Strings come from `src/i18n/locales/en.json`, the default language.

const HERO_TITLE = 'AUDIT. OPTIMIZE. REPLICATE. POSITION.';
const SIGN_IN = 'Sign in';
const CREATE_ACCOUNT = 'Create your account';

test.describe('app shell', () => {
  test('the landing route loads and renders the hero', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('Mizpa | Audita y Réplica');

    const heading = page.getByRole('heading', { level: 1, name: HERO_TITLE }).filter({ visible: true });
    await expect(heading).toHaveCount(1);
    await expect(heading).toHaveText(HERO_TITLE);
  });

  test('a protected route redirects to sign in instead of mounting its page', async ({ page }) => {
    await page.goto('/playground');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: SIGN_IN })).toBeVisible();

    // The playground never mounted, so its mode switch cannot be on the page.
    await expect(page.getByRole('button', { name: 'Skills', exact: true })).toHaveCount(0);
  });

  test('the sign-in card switches to the sign-up copy', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { level: 1, name: SIGN_IN })).toBeVisible();
    await expect(page.getByRole('button', { name: SIGN_IN, exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Don't have an account/ }).click();

    await expect(page.getByRole('heading', { level: 1, name: CREATE_ACCOUNT })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: SIGN_IN })).toHaveCount(0);
  });
});