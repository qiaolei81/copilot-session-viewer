const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('pageerror', err => {
    const msg = err.message.split('\n')[0];
    if (!errors.includes(msg)) {
      errors.push(msg);
    }
  });
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(5000);
  
  // Count events
  const eventCount = await page.evaluate(() => {
    return document.querySelectorAll('.event').length;
  });
  
  // Extract debug panel text
  const debugText = await page.evaluate(() => {
    const panel = document.querySelector('div[style*="background: #ff0000"]');
    return panel ? panel.textContent.replace(/\s+/g, ' ').trim() : null;
  });
  
  console.log(`\n✅ Events rendered: ${eventCount}`);
  console.log(`\n📊 Debug Panel:\n${debugText}\n`);
  console.log(`❌ Unique errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('\nError types:');
    errors.forEach(e => console.log(`  - ${e}`));
  }
  
  await page.screenshot({ path: '/tmp/final-test.png', fullPage: false });
  console.log('\n📸 Screenshot: /tmp/final-test.png');
  
  await browser.close();
})();
