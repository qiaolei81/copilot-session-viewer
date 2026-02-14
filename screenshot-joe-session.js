const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Go directly to Joe's session
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForSelector('.event', { timeout: 10000 });
  await page.waitForTimeout(3000); // Wait longer for 1072 events
  await page.screenshot({ path: '/tmp/joe-session-after-fix.png', fullPage: false });
  console.log('✅ Joe session screenshot saved');
  
  await browser.close();
})();
