const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'log' && msg.text().startsWith('DEBUG:')) {
      console.log(msg.text());
    }
  });
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(5000);
  
  // Inject debug code
  const counts = await page.evaluate(() => {
    const app = document.querySelector('#app');
    if (!app || !app.__vueParentComponent) {
      return { error: 'No Vue app found' };
    }
    
    // Try different ways to access Vue data
    const vue = app.__vueParentComponent;
    const ctx = vue.ctx;
    
    return {
      loadedEvents: ctx.loadedEvents?.length || 0,
      flatEvents: ctx.flatEvents?.length || 0,
      searchFilteredEvents: ctx.searchFilteredEvents?.length || 0,
      filteredEvents: ctx.filteredEvents?.length || 0,
      currentFilter: ctx.currentFilter,
      searchText: ctx.searchText,
      debouncedSearchText: ctx.debouncedSearchText
    };
  });
  
  console.log('Vue computed values:');
  console.log(JSON.stringify(counts, null, 2));
  
  await browser.close();
})();
