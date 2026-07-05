import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility regression gate (Workstream A). Runs axe against the pages
// that render without external data (home and the backtest-backed
// retrospective). Serious and critical violations fail CI. Score/marketplace
// pages depend on live providers and a database, so they are exercised by
// manual review and the unit suite rather than a headless a11y crawl here.

const PAGES = ['/', '/retrospective']

for (const path of PAGES) {
  test(`no serious or critical axe violations on ${path}`, async ({ page }) => {
    await page.goto(path)
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze()

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical'
    )
    // Attach a readable summary when it fails.
    if (blocking.length > 0) {
      console.error(
        blocking.map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} node(s)]`).join('\n')
      )
    }
    expect(blocking).toEqual([])
  })
}
