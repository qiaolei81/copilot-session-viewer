import { test, expect } from '@playwright/test';

test.describe('API Endpoints', () => {
  test('GET /api/sessions should return JSON array', async ({ request }) => {
    const response = await request.get('/api/sessions');
    
    // Check status
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    
    // Check content type
    expect(response.headers()['content-type']).toContain('application/json');
    
    // Check body is array
    const sessions = await response.json();
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
    const sessionsResponse = await request.get('/api/sessions');
    const sessions = await sessionsResponse.json();
    
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
    
    const response = await request.get('/api/sessions');
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Should respond in less than 10 seconds (generous for CI/cold-start environments)
    expect(duration).toBeLessThan(10000);
    expect(response.ok()).toBeTruthy();
  });
});
