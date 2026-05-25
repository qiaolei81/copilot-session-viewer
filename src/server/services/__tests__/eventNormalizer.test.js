const EventNormalizer = require('../eventNormalizer');

describe('EventNormalizer', () => {
  let normalizer;

  beforeEach(() => {
    normalizer = new EventNormalizer();
  });

  describe('normalizeEvents', () => {
    it('should normalize an array of events', () => {
      const events = [
        {
          type: 'assistant.message',
          timestamp: '2024-01-01T10:00:00Z',
          data: {
            message: 'test',
            tools: [
              {
                type: 'tool_use',
                id: 'abc123',
                name: 'Read',
                input: { file_path: '/test' },
                result: 'content',
                _matched: true
              }
            ]
          }
        }
      ];

      const result = normalizer.normalizeEvents(events, 'copilot');

      expect(result).toHaveLength(1);
      expect(result[0].data.tools[0]).toMatchObject({
        id: 'abc123',
        name: 'Read',
        status: 'completed',
        input: { file_path: '/test' },
        result: 'content'
      });
    });

    it('should return empty array for non-array input', () => {
      const result = normalizer.normalizeEvents(null, 'copilot');
      expect(result).toEqual([]);
    });

    it('should handle empty array', () => {
      const result = normalizer.normalizeEvents([], 'copilot');
      expect(result).toEqual([]);
    });
  });

  describe('normalizeEvent', () => {
    it('should pass through non-tool events unchanged', () => {
      const event = {
        type: 'user.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: { message: 'Hello' }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');
      expect(result).toEqual(event);
    });

    it('should return invalid events unchanged', () => {
      expect(normalizer.normalizeEvent(null, 'copilot')).toBe(null);
      expect(normalizer.normalizeEvent(undefined, 'copilot')).toBe(undefined);
      expect(normalizer.normalizeEvent('string', 'copilot')).toBe('string');
    });
  });

  describe('Copilot format normalization', () => {
    describe('tool_use with _matched flag', () => {
      it('should normalize matched tool with result', () => {
        const event = {
          type: 'assistant.message',
          timestamp: '2024-01-01T10:00:00Z',
          data: {
            tools: [
              {
                type: 'tool_use',
                id: 'tool-123',
                name: 'Read',
                input: { file_path: '/path/to/file' },
                result: 'File contents...',
                _matched: true
              }
            ]
          }
        };

        const result = normalizer.normalizeEvent(event, 'copilot');

        expect(result.data.tools[0]).toMatchObject({
          id: 'tool-123',
          name: 'Read',
          startTime: '2024-01-01T10:00:00Z',
          endTime: '2024-01-01T10:00:00Z',
          status: 'completed',
          input: { file_path: '/path/to/file' },
          result: 'File contents...',
          error: null
        });
        expect(result.data.tools[0].metadata).toMatchObject({
          source: 'copilot',
          matched: true,
          duration: 0
        });
      });

      it('should normalize unmatched tool (running)', () => {
        const event = {
          type: 'assistant.message',
          timestamp: '2024-01-01T10:00:00Z',
          data: {
            tools: [
              {
                type: 'tool_use',
                id: 'tool-456',
                name: 'Write',
                input: { file_path: '/new/file' },
                _matched: false
              }
            ]
          }
        };

        const result = normalizer.normalizeEvent(event, 'copilot');

        expect(result.data.tools[0]).toMatchObject({
          id: 'tool-456',
          name: 'Write',
          startTime: '2024-01-01T10:00:00Z',
          endTime: null,
          status: 'running',
          input: { file_path: '/new/file' },
          result: null,
          error: null
        });
        expect(result.data.tools[0].metadata.duration).toBeUndefined();
      });

      it('should normalize tool with error', () => {
        const event = {
          type: 'assistant.message',
          timestamp: '2024-01-01T10:00:00Z',
          data: {
            tools: [
              {
                type: 'tool_use',
                id: 'tool-789',
                name: 'Bash',
                input: { command: 'invalid' },
                error: 'Command failed',
                _matched: true
              }
            ]
          }
        };

        const result = normalizer.normalizeEvent(event, 'copilot');

        expect(result.data.tools[0]).toMatchObject({
          id: 'tool-789',
          name: 'Bash',
          status: 'error',
          error: 'Command failed'
        });
      });

      it('should handle tool with missing input', () => {
        const event = {
          type: 'assistant.message',
          timestamp: '2024-01-01T10:00:00Z',
          data: {
            tools: [
              {
                type: 'tool_use',
                id: 'tool-missing',
                name: 'Read',
                _matched: true
              }
            ]
          }
        };

        const result = normalizer.normalizeEvent(event, 'copilot');

        expect(result.data.tools[0].input).toEqual({});
        expect(result.data.tools[0].result).toBe(null);
      });
    });
  });

  describe('Claude format normalization', () => {
    it('should normalize tool_use from Claude format', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          message: 'Let me read that file.',
          tools: [
            {
              type: 'tool_use',
              id: 'xyz789',
              name: 'Read',
              input: { file_path: '/path/to/file' },
              result: 'File contents...',
              _matched: true
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'claude');

      expect(result.data.tools[0]).toMatchObject({
        id: 'xyz789',
        name: 'Read',
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T10:00:00Z',
        status: 'completed',
        input: { file_path: '/path/to/file' },
        result: 'File contents...',
        error: null
      });
      expect(result.data.tools[0].metadata.source).toBe('claude');
    });

    it('should handle unmatched Claude tool', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          tools: [
            {
              type: 'tool_use',
              id: 'xyz999',
              name: 'Grep',
              input: { pattern: 'test' },
              _matched: false
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'claude');

      expect(result.data.tools[0]).toMatchObject({
        status: 'running',
        endTime: null
      });
    });
  });

  describe('Pi-Mono format normalization', () => {
    it('should normalize Pi-Mono tool with status=completed', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          message: 'Let me read that file.',
          tools: [
            {
              id: 'pi-tool-1',
              name: 'Read',
              input: { file_path: '/path/to/file' },
              result: 'File contents...',
              status: 'completed',
              isError: false
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'pi-mono');

      expect(result.data.tools[0]).toMatchObject({
        id: 'pi-tool-1',
        name: 'Read',
        startTime: '2024-01-01T10:00:00Z',
        endTime: '2024-01-01T10:00:00Z',
        status: 'completed',
        input: { file_path: '/path/to/file' },
        result: 'File contents...',
        error: null
      });
      expect(result.data.tools[0].metadata.source).toBe('pi-mono');
    });

    it('should normalize Pi-Mono tool with status=running', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          tools: [
            {
              name: 'Bash',
              input: { command: 'sleep 10' },
              status: 'running',
              isError: false
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'pi-mono');

      expect(result.data.tools[0]).toMatchObject({
        name: 'Bash',
        startTime: '2024-01-01T10:00:00Z',
        endTime: null,
        status: 'running',
        result: null,
        error: null
      });
      // Should generate an ID
      expect(result.data.tools[0].id).toMatch(/^tool-\d+-[a-z0-9]+$/);
    });

    it('should normalize Pi-Mono tool with error', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          tools: [
            {
              name: 'Write',
              input: { file_path: '/readonly/file' },
              result: 'Permission denied',
              status: 'error',
              isError: true
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'pi-mono');

      expect(result.data.tools[0]).toMatchObject({
        name: 'Write',
        status: 'error',
        result: null,
        error: 'Permission denied'
      });
    });

    it('should handle Pi-Mono tool with missing id', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          tools: [
            {
              name: 'Read',
              input: {},
              status: 'completed',
              result: 'data'
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'pi-mono');

      expect(result.data.tools[0].id).toBeDefined();
      expect(typeof result.data.tools[0].id).toBe('string');
    });
  });

  describe('Edge cases', () => {
    it('should handle tool without type or status (fallback)', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          tools: [
            {
              name: 'UnknownTool',
              input: { foo: 'bar' }
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'unknown');

      expect(result.data.tools[0]).toMatchObject({
        name: 'UnknownTool',
        startTime: '2024-01-01T10:00:00Z',
        endTime: null,
        status: 'running',
        input: { foo: 'bar' },
        result: null,
        error: null
      });
      expect(result.data.tools[0].metadata.fallback).toBe(true);
    });

    it('should handle tool without name (fallback)', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          tools: [
            {
              id: 'orphan-tool',
              input: { test: true }
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');

      expect(result.data.tools[0].name).toBe('unknown');
    });

    it('should handle multiple tools in one message', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          tools: [
            {
              type: 'tool_use',
              id: 'tool-1',
              name: 'Read',
              input: {},
              _matched: true
            },
            {
              type: 'tool_use',
              id: 'tool-2',
              name: 'Write',
              input: {},
              _matched: true
            },
            {
              type: 'tool_use',
              id: 'tool-3',
              name: 'Bash',
              input: {},
              _matched: false
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');

      expect(result.data.tools).toHaveLength(3);
      expect(result.data.tools[0].status).toBe('completed');
      expect(result.data.tools[1].status).toBe('completed');
      expect(result.data.tools[2].status).toBe('running');
    });

    it('should handle assistant message without tools', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          message: 'Just text, no tools'
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');
      expect(result).toEqual(event);
    });

    it('should handle assistant message with empty tools array', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          message: 'Text',
          tools: []
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');
      expect(result.data.tools).toEqual([]);
    });
  });

  describe('Timeline event normalization', () => {
    it('should normalize tool.execution_start', () => {
      const event = {
        type: 'tool.execution_start',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          toolCallId: 'exec-123',
          tool: 'Read',
          arguments: { file_path: '/test' }
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');

      expect(result.data).toMatchObject({
        toolCallId: 'exec-123',
        toolName: 'Read',
        tool: 'Read',
        arguments: { file_path: '/test' }
      });
    });

    it('should normalize tool.execution_complete', () => {
      const event = {
        type: 'tool.execution_complete',
        timestamp: '2024-01-01T10:00:05Z',
        data: {
          toolCallId: 'exec-123',
          toolName: 'Read',
          result: 'contents'
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');

      expect(result.data).toMatchObject({
        toolCallId: 'exec-123',
        toolName: 'Read',
        result: 'contents'
      });
    });

    it('should normalize tool.execution_start with inconsistent field names', () => {
      const event = {
        type: 'tool.execution_start',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          id: 'exec-456',
          name: 'Write'
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');

      expect(result.data.toolCallId).toBe('exec-456');
      expect(result.data.toolName).toBe('Write');
    });

    it('should pass through subagent events unchanged', () => {
      const event = {
        type: 'subagent.started',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          agentName: 'researcher',
          toolCallId: 'subagent-1'
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');
      expect(result).toEqual(event);
    });

    it('should pass through subagent.completed unchanged', () => {
      const event = {
        type: 'subagent.completed',
        timestamp: '2024-01-01T10:05:00Z',
        data: {
          toolCallId: 'subagent-1',
          result: 'Done'
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');
      expect(result).toEqual(event);
    });
  });

  describe('Status computation', () => {
    it('should compute status=error when error field is present', () => {
      const status = normalizer._computeStatus({
        error: 'Something failed',
        _matched: true
      });

      expect(status).toBe('error');
    });

    it('should compute status=completed when matched with result', () => {
      const status = normalizer._computeStatus({
        _matched: true,
        result: 'success'
      });

      expect(status).toBe('completed');
    });

    it('should compute status=running when explicitly unmatched', () => {
      const status = normalizer._computeStatus({
        _matched: false
      });

      expect(status).toBe('running');
    });

    it('should compute status=completed for matched tool without result', () => {
      const status = normalizer._computeStatus({
        _matched: true
      });

      expect(status).toBe('completed');
    });

    it('should compute status=running when no match info available', () => {
      const status = normalizer._computeStatus({});
      expect(status).toBe('running');
    });
  });

  describe('Duration computation', () => {
    it('should compute duration correctly', () => {
      const duration = normalizer._computeDuration(
        '2024-01-01T10:00:00.000Z',
        '2024-01-01T10:00:05.000Z'
      );

      expect(duration).toBe(5000);
    });

    it('should return undefined for null endTime', () => {
      const duration = normalizer._computeDuration(
        '2024-01-01T10:00:00.000Z',
        null
      );

      expect(duration).toBeUndefined();
    });

    it('should return undefined for null startTime', () => {
      const duration = normalizer._computeDuration(
        null,
        '2024-01-01T10:00:05.000Z'
      );

      expect(duration).toBeUndefined();
    });

    it('should return undefined for invalid timestamps', () => {
      const duration = normalizer._computeDuration(
        'invalid',
        '2024-01-01T10:00:05.000Z'
      );

      expect(duration).toBeUndefined();
    });

    it('should return undefined for negative duration', () => {
      const duration = normalizer._computeDuration(
        '2024-01-01T10:00:05.000Z',
        '2024-01-01T10:00:00.000Z'
      );

      expect(duration).toBeUndefined();
    });

    it('should handle zero duration', () => {
      const ts = '2024-01-01T10:00:00.000Z';
      const duration = normalizer._computeDuration(ts, ts);

      expect(duration).toBe(0);
    });
  });

  describe('Tool ID generation', () => {
    it('should generate unique tool IDs', () => {
      const id1 = normalizer._generateToolId();
      const id2 = normalizer._generateToolId();

      expect(id1).toMatch(/^tool-\d+-[a-z0-9]+$/);
      expect(id2).toMatch(/^tool-\d+-[a-z0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Integration scenarios', () => {
    it('should handle mixed format events (should not happen but be defensive)', () => {
      const events = [
        {
          type: 'assistant.message',
          timestamp: '2024-01-01T10:00:00Z',
          data: {
            tools: [
              { type: 'tool_use', id: '1', name: 'Read', input: {}, _matched: true }
            ]
          }
        },
        {
          type: 'assistant.message',
          timestamp: '2024-01-01T10:01:00Z',
          data: {
            tools: [
              { name: 'Write', input: {}, status: 'completed' }
            ]
          }
        }
      ];

      const result = normalizer.normalizeEvents(events, 'copilot');

      expect(result[0].data.tools[0].metadata.source).toBe('copilot');
      expect(result[1].data.tools[0].metadata.source).toBe('copilot');
    });

    it('should preserve non-tool data in assistant messages', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2024-01-01T10:00:00Z',
        data: {
          message: 'Important message',
          model: 'claude-3',
          usage: { input: 100, output: 50 },
          tools: [
            { type: 'tool_use', id: '1', name: 'Read', input: {}, _matched: true }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'claude');

      expect(result.data.message).toBe('Important message');
      expect(result.data.model).toBe('claude-3');
      expect(result.data.usage).toEqual({ input: 100, output: 50 });
    });

    it('should handle real-world Copilot event', () => {
      const event = {
        type: 'assistant.message',
        timestamp: '2026-02-16T17:49:29.531Z',
        data: {
          content: 'Let me search for that function.',
          toolRequests: [],
          tools: [
            {
              type: 'tool_use',
              id: 'toolu_01ABC123',
              name: 'Grep',
              input: {
                pattern: 'function.*getData',
                path: 'src',
                output_mode: 'content'
              },
              result: 'Found 3 matches...',
              status: 'success',
              _matched: true
            }
          ]
        }
      };

      const result = normalizer.normalizeEvent(event, 'copilot');

      expect(result.data.tools[0]).toMatchObject({
        id: 'toolu_01ABC123',
        name: 'Grep',
        status: 'completed',
        result: 'Found 3 matches...'
      });
    });
  });
});
