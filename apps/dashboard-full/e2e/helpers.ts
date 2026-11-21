import { Page } from '@playwright/test';

/**
 * Picks an option of a card's choice: on a wide screen the option is a toggle button; on a phone the choice is a
 * single line that opens a bottom sheet, and the option is a row of it.
 */
export async function choose(page: Page, group: string, option: string): Promise<void> {
  const g = page.getByTestId(group);
  if ((await g.evaluate((el) => el.tagName)) === 'BUTTON') {
    await g.tap();
    await page.locator(`[data-testid="sheet-action"][data-option="${option}"]`).tap();
  } else {
    await page.getByTestId(option).locator('button').tap();
  }
}
