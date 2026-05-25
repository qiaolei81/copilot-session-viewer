const { z } = require('zod');

/**
 * Unified Event Schema for Copilot Session Viewer
 * 
 * This schema defines the standardized event format that the API returns to the frontend.
 * Both Copilot and Claude events are normalized to match this schema.
 */

// Tool call schema (unified format for both Copilot and Claude)
const ToolSchema = z.object({
  type: z.literal('tool_use'),
  id: z.string(),
  name: z.string(),
  input: z.record(z.any()),
  result: z.any().optional(), // Tool execution result (when matched)
  status: z.enum(['success', 'error', 'running']).optional(),
  error: z.string().optional(),
  _matched: z.boolean().optional() // Internal flag: whether result was matched
});

// Subagent metadata (for events belonging to a subagent)
const SubagentMetadataSchema = z.object({
  id: z.string(),
  name: z.string()
}).optional();

// Event data schema (standardized data field)
const EventDataSchema = z.object({
  // Message content (text)
  message: z.string().optional(),
  text: z.string().optional(), // Alternative field name (legacy)
  
  // Tool calls (unified format)
  tools: z.array(ToolSchema).optional(),
  
  // Original fields preserved for reference
  // (Copilot-specific fields)
  messageId: z.string().optional(),
  content: z.string().optional(), // Original Copilot content field
  toolRequests: z.array(z.any()).optional(), // Original Copilot toolRequests
  
  // (Claude-specific fields)
  // ... other fields as needed
}).passthrough(); // Allow additional fields

// Base event schema
const EventSchema = z.object({
  // Core fields
  type: z.string(),
  id: z.string().optional(),
  timestamp: z.string(),
  parentId: z.string().nullable().optional(),
  
  // Standardized data
  data: EventDataSchema.optional(),
  
  // Metadata
  _subagent: SubagentMetadataSchema,
  _fileIndex: z.number().optional(),
  
  // Virtual fields (computed by frontend)
  stableId: z.string().optional(),
  virtualIndex: z.number().optional()
}).passthrough(); // Allow additional fields for flexibility

// Export schemas
module.exports = {
  EventSchema,
  EventDataSchema,
  ToolSchema,
  SubagentMetadataSchema
};
