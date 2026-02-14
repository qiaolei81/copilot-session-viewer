const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture console logs
  page.on('console', msg => console.log('BROWSER:', msg.text()));
  page.on('pageerror', err => console.error('PAGE ERROR:', err.message));
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(3000);
  
  // Check Vue data
  const vueData = await page.evaluate(() => {
    const app = document.querySelector('#app').__vueParentComponent;
    if (!app) return { error: 'No Vue app found' };
    
    const ctx = app.ctx;
    return {
      loadedEventsLength: ctx.loadedEvents?.length || 0,
      flatEventsLength: ctx.flatEvents?.length || 0,
      searchFilteredEventsLength: ctx.searchFilteredEvents?.length || 0,
      filteredEventsLength: ctx.filteredEvents?.length || 0,
      searchText: ctx.searchText || '',
      debouncedSearchText: ctx.debouncedSearchText || '',
      currentFilter: ctx.currentFilter || 'all'
    };
  });
  
  console.log('\n=== Vue Data ===');
  console.log(JSON.stringify(vueData, null, 2));
  
  await browser.close();
})();
