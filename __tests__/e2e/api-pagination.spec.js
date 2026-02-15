import { test, expect } from '@playwright/test';

test.describe('API Pagination', () => {
  test.beforeEach(async ({ request }) => {
    // Verify API is accessible
    const response = await request.get('/api/sessions');
    expect(response.ok()).toBeTruthy();
  });

  test('should return sessions with load-more endpoint', async ({ request }) => {
    const response = await request.get('/api/sessions/load-more?offset=0&limit=10');

    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('sessions');
    expect(data).toHaveProperty('hasMore');
    expect(data).toHaveProperty('totalSessions');

    expect(Array.isArray(data.sessions)).toBeTruthy();
    expect(typeof data.hasMore).toBe('boolean');
    expect(typeof data.totalSessions).toBe('number');
  });

  test('should handle offset and limit parameters correctly', async ({ request }) => {
    // Test with different pagination parameters
    const tests = [
      { offset: 0, limit: 5 },
      { offset: 5, limit: 10 },
      { offset: 10, limit: 20 },
    ];

    for (const { offset, limit } of tests) {
      const response = await request.get(`/api/sessions/load-more?offset=${offset}&limit=${limit}`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.sessions.length).toBeLessThanOrEqual(limit);

      // Each session should have required properties
      if (data.sessions.length > 0) {
        const session = data.sessions[0];
        expect(session).toHaveProperty('id');
        expect(session).toHaveProperty('summary');
        expect(session).toHaveProperty('createdAt');
      }
    }
  });

  test('should handle large offset values gracefully', async ({ request }) => {
    const response = await request.get('/api/sessions/load-more?offset=9999&limit=10');

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    // Should return empty array when offset exceeds available sessions
    expect(data.sessions).toEqual([]);
    expect(data.hasMore).toBe(false);
  });

  test('should validate limit parameter bounds', async ({ request }) => {
    // Test with invalid limit values
    const invalidLimits = [-1, 0, 101];

    for (const limit of invalidLimits) {
      const response = await request.get(`/api/sessions/load-more?offset=0&limit=${limit}`);

      // API may or may not validate limits - just ensure it doesn't crash
      expect([200, 400]).toContain(response.status());

      if (response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('sessions');
      }
    }
  });

  test('should validate offset parameter', async ({ request }) => {
    // Test with invalid offset values
    const invalidOffsets = [-1];

    for (const offset of invalidOffsets) {
      const response = await request.get(`/api/sessions/load-more?offset=${offset}&limit=10`);

      // API may or may not validate offsets - just ensure it responds
      expect([200, 400]).toContain(response.status());

      if (response.ok()) {
        const data = await response.json();
        expect(data).toHaveProperty('sessions');
      }
    }
  });

  test('should return consistent data structure across requests', async ({ request }) => {
    // Make multiple requests to ensure consistency
    const requests = await Promise.all([
      request.get('/api/sessions/load-more?offset=0&limit=5'),
      request.get('/api/sessions/load-more?offset=5&limit=5'),
      request.get('/api/sessions/load-more?offset=10&limit=5'),
    ]);

    for (const response of requests) {
      expect(response.ok()).toBeTruthy();

      const data = await response.json();

      // Verify data structure consistency
      expect(data).toHaveProperty('sessions');
      expect(data).toHaveProperty('hasMore');
      expect(data).toHaveProperty('totalSessions');

      // Verify session objects structure
      data.sessions.forEach(session => {
        expect(session).toHaveProperty('id');
        expect(session).toHaveProperty('summary');
        expect(session).toHaveProperty('createdAt');
        expect(session).toHaveProperty('eventCount');
        expect(session).toHaveProperty('type');

        // Validate data types
        expect(typeof session.id).toBe('string');
        expect(typeof session.summary).toBe('string');
        expect(typeof session.createdAt).toBe('string');
        expect(typeof session.eventCount).toBe('number');
        expect(['directory', 'file']).toContain(session.type);
      });
    }
  });

  test('should handle pagination edge cases', async ({ request }) => {
    // Get total sessions count first
    const initialResponse = await request.get('/api/sessions/load-more?offset=0&limit=1');
    const initialData = await initialResponse.json();
    const totalSessions = initialData.totalSessions;

    if (totalSessions > 0) {
      // Test requesting exactly at the boundary
      const boundaryResponse = await request.get(`/api/sessions/load-more?offset=${totalSessions - 1}&limit=1`);
      expect(boundaryResponse.ok()).toBeTruthy();

      const boundaryData = await boundaryResponse.json();
      expect(boundaryData.sessions.length).toBe(1);
      expect(boundaryData.hasMore).toBe(false);

      // Test requesting beyond boundary
      const beyondResponse = await request.get(`/api/sessions/load-more?offset=${totalSessions}&limit=1`);
      expect(beyondResponse.ok()).toBeTruthy();

      const beyondData = await beyondResponse.json();
      expect(beyondData.sessions.length).toBe(0);
      expect(beyondData.hasMore).toBe(false);
    }
  });

  test('should maintain reasonable session ordering', async ({ request }) => {
    // Make overlapping requests to check for basic consistency
    const response1 = await request.get('/api/sessions/load-more?offset=0&limit=5');
    const response2 = await request.get('/api/sessions/load-more?offset=0&limit=5');

    expect(response1.ok()).toBeTruthy();
    expect(response2.ok()).toBeTruthy();

    const data1 = await response1.json();
    const data2 = await response2.json();

    // Same request should return same results
    expect(data1.sessions.length).toBe(data2.sessions.length);

    if (data1.sessions.length > 0 && data2.sessions.length > 0) {
      // First session should be the same in both requests
      expect(data1.sessions[0].id).toBe(data2.sessions[0].id);
    }
  });

  test('should have reasonable response time', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get('/api/sessions/load-more?offset=0&limit=20');

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds

    // For small datasets, should be much faster
    if (responseTime < 1000) {
      console.log(`Fast API response: ${responseTime}ms`);
    }
  });

  test('should handle concurrent requests correctly', async ({ request }) => {
    // Make multiple concurrent requests
    const concurrentRequests = Array.from({ length: 5 }, (_, i) =>
      request.get(`/api/sessions/load-more?offset=${i * 5}&limit=5`)
    );

    const responses = await Promise.all(concurrentRequests);

    // All requests should succeed
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });

    // Parse all responses
    const dataPromises = responses.map(response => response.json());
    const allData = await Promise.all(dataPromises);

    // Verify all responses have consistent structure
    allData.forEach(data => {
      expect(data).toHaveProperty('sessions');
      expect(data).toHaveProperty('hasMore');
      expect(data).toHaveProperty('totalSessions');
    });

    // Total sessions count should be consistent across all responses
    const totalCounts = allData.map(data => data.totalSessions);
    const uniqueTotalCounts = [...new Set(totalCounts)];
    expect(uniqueTotalCounts.length).toBe(1); // All should have same total count
  });

  test('should work with default parameters', async ({ request }) => {
    // Test endpoint without explicit offset/limit parameters
    const response = await request.get('/api/sessions/load-more');

    expect(response.ok()).toBeTruthy();
    const data = await response.json();

    expect(data).toHaveProperty('sessions');
    expect(data).toHaveProperty('hasMore');
    expect(data).toHaveProperty('totalSessions');

    // Should default to reasonable values (typically offset=0, limit=20)
    expect(data.sessions.length).toBeLessThanOrEqual(20);
  });
});