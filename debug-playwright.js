const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // 打开 session 页面
  await page.goto('http://localhost:3838/session/lucid-canyon');
  
  // 等待加载
  await page.waitForTimeout(2000);
  
  // 提取页面上的 events 数据
  const debugInfo = await page.evaluate(() => {
    // 找到所有 subagent 相关事件
    const subagentEvents = window.events.filter(e => 
      e.type === 'subagent.started' || e.type === 'subagent.completed'
    );
    
    return {
      totalEvents: window.events.length,
      subagentEvents: subagentEvents.map(e => ({
        type: e.type,
        timestamp: e.timestamp,
        childSessionKey: e.childSessionKey,
        sessionKey: e.sessionKey,
        parentId: e.parentId
      })),
      scopes: window.subagentScopes || []
    };
  });
  
  console.log('Debug Info:');
  console.log(JSON.stringify(debugInfo, null, 2));
  
  await browser.close();
})();
