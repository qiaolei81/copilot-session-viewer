const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(3000);
  
  // Check what events are actually rendered
  const events = await page.evaluate(() => {
    const eventElements = document.querySelectorAll('.event');
    return Array.from(eventElements).slice(0, 20).map(el => {
      const badge = el.querySelector('.event-badge');
      const type = el.getAttribute('data-type');
      return { type, badgeText: badge ? badge.textContent : null };
    });
  });
  
  console.log('First 20 rendered events:');
  events.forEach((e, i) => console.log(`${i+1}. ${e.type} - "${e.badgeText}"`));
  
  // Count by type
  const allEvents = await page.evaluate(() => {
    const eventElements = document.querySelectorAll('.event');
    const counts = {};
    Array.from(eventElements).forEach(el => {
      const type = el.getAttribute('data-type');
      counts[type] = (counts[type] || 0) + 1;
    });
    return counts;
  });
  
  console.log('\nEvent counts in DOM:');
  Object.entries(allEvents).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  
  await browser.close();
})();
