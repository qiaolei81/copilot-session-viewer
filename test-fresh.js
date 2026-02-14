const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ 
    ignoreHTTPSErrors: true,
    // Force fresh load
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();
  
  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.message.split('\n')[0]);
  });
  
  // Clear cache and reload
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8', {
    waitUntil: 'networkidle'
  });
  
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(5000);
  
  const eventCount = await page.evaluate(() => {
    return document.querySelectorAll('.event').length;
  });
  
  console.log(`Events rendered: ${eventCount}`);
  console.log(`Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Errors:', errors.slice(0, 3));
  }
  
  await page.screenshot({ path: '/tmp/test-fresh.png' });
  console.log('Screenshot saved');
  
  await browser.close();
})();
