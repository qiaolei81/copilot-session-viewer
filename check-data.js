const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(5000);
  
  const vueData = await page.evaluate(() => {
    // Access Vue instance data
    const app = document.querySelector('#app').__vueParentComponent;
    if (!app) return { error: 'No Vue instance found' };
    
    const ctx = app.ctx;
    return {
      flatEventsLength: ctx.flatEvents?.length || 0,
      filteredEventsLength: ctx.filteredEvents?.length || 0,
      loadedEventsLength: ctx.loadedEvents?.length || 0,
      eventsLoading: ctx.eventsLoading,
      eventsError: ctx.eventsError,
      currentFilter: ctx.currentFilter,
      searchText: ctx.searchText
    };
  });
  
  console.log('Vue data:', JSON.stringify(vueData, null, 2));
  
  await browser.close();
})();
