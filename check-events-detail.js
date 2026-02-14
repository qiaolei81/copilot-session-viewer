const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(5000);
  
  const events = await page.evaluate(() => {
    const eventElements = document.querySelectorAll('.event');
    return Array.from(eventElements).map(el => {
      const badge = el.querySelector('.event-badge');
      const dataType = el.getAttribute('data-type');
      return {
        type: badge ? badge.textContent.trim() : 'unknown',
        dataType: dataType
      };
    });
  });
  
  console.log('Rendered events:');
  events.forEach((e, i) => {
    console.log(`  ${i+1}. ${e.type} (data-type: ${e.dataType})`);
  });
  
  // Check Vue data
  const vueInfo = await page.evaluate(() => {
    const scroller = document.querySelector('.scroller');
    return {
      hasScroller: !!scroller,
      scrollerClasses: scroller ? scroller.className : null
    };
  });
  
  console.log('\nVue scroller info:', vueInfo);
  
  await browser.close();
})();
