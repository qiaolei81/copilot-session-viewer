const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false }); // visible for debugging
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`BROWSER: ${msg.text()}`);
  });
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  
  // Add debug logging to page
  await page.evaluate(() => {
    console.log('=== Checking Vue mount ===');
    const app = document.querySelector('#app');
    console.log('App element:', !!app);
    console.log('Has __vueParentComponent:', !!app?.__vueParentComponent);
    
    // Try to access data directly via window
    setTimeout(() => {
      console.log('=== After 3s ===');
      const events = document.querySelectorAll('.event');
      console.log('Events in DOM:', events.length);
      
      const scroller = document.querySelector('.vue-recycle-scroller');
      console.log('Has scroller:', !!scroller);
      
      const dynamicItems = document.querySelectorAll('[data-index]');
      console.log('Dynamic items:', dynamicItems.length);
    }, 3000);
  });
  
  await page.waitForTimeout(5000);
  
  await page.screenshot({ path: '/tmp/debug-vue.png', fullPage: true });
  console.log('Screenshot saved');
  
  await browser.close();
})();
