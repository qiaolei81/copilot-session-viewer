const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const errors = [];
  page.on('pageerror', err => {
    errors.push(err.message.split('\n')[0]);
  });
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(3000);
  
  const eventCount = await page.evaluate(() => {
    return document.querySelectorAll('.event').length;
  });
  
  const assistantCount = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.event')).filter(el => {
      const badge = el.querySelector('.event-badge');
      return badge && badge.textContent.includes('assistant.message');
    }).length;
  });
  
  console.log(`✅ Total events rendered: ${eventCount}`);
  console.log(`✅ Assistant messages: ${assistantCount}`);
  console.log(`❌ JS Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('First 3 errors:');
    errors.slice(0, 3).forEach(err => console.log('  -', err));
  }
  
  await page.screenshot({ path: '/tmp/fixed-render.png', fullPage: false });
  console.log('📸 Screenshot: /tmp/fixed-render.png');
  
  await browser.close();
})();
