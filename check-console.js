const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const logs = [];
  page.on('console', msg => {
    logs.push(`${msg.type()}: ${msg.text()}`);
  });
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(5000);
  
  console.log('=== Console logs ===');
  logs.forEach(log => console.log(log));
  
  // Check DOM structure
  const domInfo = await page.evaluate(() => {
    return {
      hasApp: !!document.querySelector('#app'),
      hasMainLayout: !!document.querySelector('.main-layout'),
      hasScroller: !!document.querySelector('.vue-recycle-scroller'),
      hasEvents: document.querySelectorAll('.event').length,
      hasDynamicScroller: !!document.querySelector('[data-index]')
    };
  });
  
  console.log('\n=== DOM structure ===');
  console.log(JSON.stringify(domInfo, null, 2));
  
  await browser.close();
})();
