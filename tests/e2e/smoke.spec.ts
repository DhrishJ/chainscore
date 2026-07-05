import { expect, test } from '@playwright/test'

test('home page renders', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/ChainScore/)
})

test('score API rejects an invalid address with 400', async ({ request }) => {
  const res = await request.get('/api/score/notanaddress')
  expect(res.status()).toBe(400)
})
