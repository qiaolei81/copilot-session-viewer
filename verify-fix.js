const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(3000);
  
  // Count events by type
  const eventCounts = await page.evaluate(() => {
    const events = document.querySelectorAll('.event');
    const counts = {};
    Array.from(events).forEach(el => {
      const badge = el.querySelector('.event-badge');
      if (badge) {
        const text = badge.textContent.trim();
        counts[text] = (counts[text] || 0) + 1;
      }
    });
    return counts;
  });
  
  console.log('Event counts:', eventCounts);
  console.log('Total events rendered:', Object.values(eventCounts).reduce((a, b) => a + b, 0));
  
  await page.screenshot({ path: '/tmp/fixed-session.png', fullPage: false });
  console.log('✅ Screenshot saved to /tmp/fixed-session.png');
  
  await browser.close();
})();
