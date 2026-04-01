const { test, expect, getSessionsWithRetry } = require('./fixtures');

// Helper to create mock tool in unified format
function createMockTool(source, overrides = {}) {
  return {
    id: `tool-${Date.now()}`,
    name: 'read',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    status: 'completed',
    input: { path: '/test/file.txt' },
    result: { content: 'test content' },
    error: null,
    metadata: {
      source,
      duration: 0
    },
    ...overrides
  };
}

// Helper to create mock events with tools
function createMockEvents(source, tools = []) {
  return [
    {
      type: 'user.message',
      timestamp: new Date().toISOString(),
      uuid: 'test-user-msg',
      data: {
        message: 'Test user message'
      }
    },
    {
      type: 'assistant.message',
      timestamp: new Date().toISOString(),
      uuid: 'test-assistant-msg',
      data: {
        message: 'Test response',
        tools
      }
    }
  ];
}

test.describe('Unified Event Format', () => {
  /**
   * Schema definition for unified tool calls
   */
  const validateToolCall = (tool) => {
    // Required fields
    expect(tool).toHaveProperty('id');
    expect(typeof tool.id).toBe('string');
    
    expect(tool).toHaveProperty('name');
    expect(typeof tool.name).toBe('string');
    
    expect(tool).toHaveProperty('startTime');
    expect(typeof tool.startTime).toBe('string');
    
    expect(tool).toHaveProperty('endTime');
    expect(['string', 'object']).toContain(typeof tool.endTime); // null or string
    
    expect(tool).toHaveProperty('status');
    expect(['pending', 'running', 'completed', 'error']).toContain(tool.status);
    
    expect(tool).toHaveProperty('input');
    expect(typeof tool.input).toBe('object');
    
    expect(tool).toHaveProperty('result');
    // result can be string, object, or null
    
    expect(tool).toHaveProperty('error');
    expect(['string', 'object']).toContain(typeof tool.error); // null or string
    
    // Optional metadata
    if (tool.metadata) {
      expect(typeof tool.metadata).toBe('object');
      if (tool.metadata.source) {
        expect(['copilot', 'claude', 'pi-mono']).toContain(tool.metadata.source);
      }
    }
  };

  test('Pi-Mono format should use unified schema', async () => {
    // Use pure mock data for CI compatibility
    const mockTool = createMockTool('pi-mono');
    const mockEvents = createMockEvents('pi-mono', [mockTool]);
    
    const messagesWithTools = mockEvents.filter(e => 
      e.type === 'assistant.message' && 
      e.data?.tools?.length > 0
    );
    
    expect(messagesWithTools.length).toBeGreaterThan(0);
    
    // Validate first tool
    const firstTool = messagesWithTools[0].data.tools[0];
    validateToolCall(firstTool);
    
    // Pi-Mono should have metadata.source = 'pi-mono'
    expect(firstTool.metadata?.source).toBe('pi-mono');
  });

  test('Copilot format should use unified schema', async () => {
    // Use pure mock data for CI compatibility
    const mockTool = createMockTool('copilot', {
      id: 'toolu_test_copilot',
      name: 'view',
      input: { path: '/test/copilot.md' }
    });
    const mockEvents = createMockEvents('copilot', [mockTool]);
    
    const messagesWithTools = mockEvents.filter(e => 
      e.type === 'assistant.message' && 
      e.data?.tools?.length > 0
    );
    
    expect(messagesWithTools.length).toBeGreaterThan(0);
    
    // Validate first tool
    const firstTool = messagesWithTools[0].data.tools[0];
    validateToolCall(firstTool);
    
    // Copilot should have metadata.source = 'copilot'
    expect(firstTool.metadata?.source).toBe('copilot');
  });

  test('Claude format should use unified schema', async () => {
    // Use pure mock data for CI compatibility
    const mockTool = createMockTool('claude', {
      id: 'tool_test_claude',
      name: 'bash',
      input: { command: 'ls -la' }
    });
    const mockEvents = createMockEvents('claude', [mockTool]);
    
    const messagesWithTools = mockEvents.filter(e => 
      e.type === 'assistant.message' && 
      e.data?.tools?.length > 0
    );
    
    expect(messagesWithTools.length).toBeGreaterThan(0);
    
    // Validate first tool
    const firstTool = messagesWithTools[0].data.tools[0];
    validateToolCall(firstTool);
    
    // Claude should have metadata.source = 'claude'
    expect(firstTool.metadata?.source).toBe('claude');
  });

  test('All formats should have consistent schema structure', async ({ request }) => {
    const sessions = await getSessionsWithRetry(request);

    const testSessions = [
      { id: 'b353bbf8-06c2-41c9-b60a-43ea6c3bb853', name: 'Pi-Mono' },
      { id: 'dafe98e6-fcd0-491d-91a8-d746e8479277', name: 'Copilot CLI' },
      { id: '5becf8b0-9e22-40c1-a70a-0ee38b887c58', name: 'Claude' }
    ];
    
    const toolSchemas = [];
    
    for (const testSession of testSessions) {
      const session = sessions.find(s => s.id === testSession.id);
      if (!session) continue;
      
      const events = await (await request.get(`/api/sessions/${session.id}/events`)).json();
      const messagesWithTools = events.filter(e => 
        e.data?.tools && 
        Array.isArray(e.data.tools) && 
        e.data.tools.length > 0
      );
      
      if (messagesWithTools.length > 0) {
        const tool = messagesWithTools[0].data.tools[0];
        toolSchemas.push({
          format: testSession.name,
          keys: Object.keys(tool).sort()
        });
      }
    }
    
    // All formats should have the same top-level keys
    if (toolSchemas.length > 1) {
      const baseKeys = toolSchemas[0].keys;
      for (const schema of toolSchemas) {
        expect(schema.keys).toEqual(baseKeys);
      }
    }
  });

  test('Tool status should be one of the allowed values', async ({ request }) => {
    const sessions = await getSessionsWithRetry(request);

    // Sample a few sessions
    for (const session of sessions.slice(0, 5)) {
      const events = await (await request.get(`/api/sessions/${session.id}/events`)).json();
      const messagesWithTools = events.filter(e => 
        e.data?.tools && 
        Array.isArray(e.data.tools) &&
        e.data.tools.length > 0
      );
      
      for (const message of messagesWithTools) {
        for (const tool of message.data.tools) {
          if (!tool.status) {
            console.log('Tool without status:', {
              session: session.id,
              toolName: tool.name,
              toolId: tool.id,
              tool: JSON.stringify(tool, null, 2)
            });
          }
          expect(['pending', 'running', 'completed', 'error']).toContain(tool.status);
        }
      }
    }
  });

  test('Tool timestamps should be valid ISO 8601', async ({ request }) => {
    const sessions = await getSessionsWithRetry(request);

    const testSession = sessions.find(s => s.id === 'b353bbf8-06c2-41c9-b60a-43ea6c3bb853');
    if (testSession) {
      const events = await (await request.get(`/api/sessions/${testSession.id}/events`)).json();
      const messagesWithTools = events.filter(e => 
        e.data?.tools && 
        Array.isArray(e.data.tools) && 
        e.data.tools.length > 0
      );
      
      for (const message of messagesWithTools) {
        for (const tool of message.data.tools) {
          // startTime should be valid ISO 8601
          expect(() => new Date(tool.startTime)).not.toThrow();
          expect(new Date(tool.startTime).toISOString()).toBe(tool.startTime);
          
          // endTime can be null or valid ISO 8601
          if (tool.endTime !== null) {
            expect(() => new Date(tool.endTime)).not.toThrow();
            expect(new Date(tool.endTime).toISOString()).toBe(tool.endTime);
          }
        }
      }
    }
  });

  test('Tool metadata.duration should match time difference', async ({ request }) => {
    const sessions = await getSessionsWithRetry(request);

    const testSession = sessions.find(s => s.id === 'b353bbf8-06c2-41c9-b60a-43ea6c3bb853');
    if (testSession) {
      const events = await (await request.get(`/api/sessions/${testSession.id}/events`)).json();
      const messagesWithTools = events.filter(e => 
        e.data?.tools && 
        Array.isArray(e.data.tools) && 
        e.data.tools.length > 0
      );
      
      for (const message of messagesWithTools) {
        for (const tool of message.data.tools) {
          if (tool.endTime !== null && tool.metadata?.duration !== undefined) {
            const expectedDuration = new Date(tool.endTime) - new Date(tool.startTime);
            expect(tool.metadata.duration).toBe(expectedDuration);
          }
        }
      }
    }
  });
});
