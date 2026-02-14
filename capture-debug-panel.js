const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Capture console
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[ERROR] ${err.message.split('\n')[0]}`));
  
  await page.goto('http://localhost:3838/session/796c6ec9-cb6d-4e01-b9b2-dd35e9a0cef8');
  await page.waitForSelector('.main-layout', { timeout: 10000 });
  await page.waitForTimeout(5000);
  
  // Take screenshot
  await page.screenshot({ path: '/tmp/debug-panel.png', fullPage: false });
  console.log('✅ Screenshot saved: /tmp/debug-panel.png');
  
  // Extract debug text
  const debugText = await page.evaluate(() => {
    const panel = document.querySelector('div[style*="background: #ff0000"]');
    return panel ? panel.textContent : 'DEBUG PANEL NOT FOUND';
  });
  
  console.log('\n📊 Debug Panel Content:');
  console.log(debugText);
  
  console.log('\n📋 Console Logs:');
  logs.forEach(log => console.log(log));
  
  await browser.close();
})();
