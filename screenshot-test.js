const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Homepage
  await page.goto('http://localhost:3838');
  await page.waitForSelector('.recent-list', { timeout: 10000 });
  await page.screenshot({ path: '/tmp/homepage-after-fix.png', fullPage: true });
  console.log('✅ Homepage screenshot saved');
  
  // Session detail
  const firstSession = await page.locator('.recent-item').first();
  await firstSession.click();
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForSelector('.event', { timeout: 10000 });
  await page.waitForTimeout(2000); // Wait for virtual scroller
  await page.screenshot({ path: '/tmp/session-detail-after-fix.png', fullPage: true });
  console.log('✅ Session detail screenshot saved');
  
  await browser.close();
})();
