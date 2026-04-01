const { test, expect, getSessionsWithRetry } = require('./fixtures');

test.describe('API Endpoints', () => {
  test('GET /api/sessions should return JSON array', async ({ request }) => {
    const sessions = await getSessionsWithRetry(request);
    expect(Array.isArray(sessions)).toBeTruthy();
    
    // Check sessions have required fields
    if (sessions.length > 0) {
      const firstSession = sessions[0];
      expect(firstSession).toHaveProperty('id');
      expect(firstSession).toHaveProperty('type');
      expect(firstSession).toHaveProperty('summary');
      expect(firstSession).toHaveProperty('eventCount');
    }
  });

  test('GET /api/sessions/:id/events should return events', async ({ request }) => {
    // First get a session ID
    const sessions = await getSessionsWithRetry(request);

    if (sessions.length > 0) {
      const sessionId = sessions[0].id;
      
      // Get events for that session
      const eventsResponse = await request.get(`/api/sessions/${sessionId}/events`);
      expect(eventsResponse.ok()).toBeTruthy();
      
      const events = await eventsResponse.json();
      expect(Array.isArray(events)).toBeTruthy();
    }
  });

  test('GET /api/sessions/:id/events should return 400/404 for invalid ID', async ({ request }) => {
    const response = await request.get('/api/sessions/../../../etc/passwd/events');
    
    // Should reject path traversal (400 or 404)
    expect([400, 404]).toContain(response.status());
  });

  test('GET /api/sessions should be fast', async ({ request }) => {
    const startTime = Date.now();
    const sessions = await getSessionsWithRetry(request);

    const endTime = Date.now();
    const duration = endTime - startTime;

    // Should respond in less than 20 seconds (generous for CI/cold-start/large datasets)
    expect(duration).toBeLessThan(20000);
    expect(Array.isArray(sessions)).toBeTruthy();
  });
});
