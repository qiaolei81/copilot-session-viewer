/**
 * Insight Generation Service
 * Handles session insight report generation with atomic operations
 */

const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const config = require('../config');
const processManager = require('../utils/processManager');

class InsightService {
  constructor(sessionDir) {
    this.sessionDir = sessionDir;
  }

  /**
   * Generate or retrieve insight report
   * @param {string} sessionId - Session UUID
   * @param {boolean} forceRegenerate - Force new generation
   * @returns {Promise<Object>} Insight status and report
   */
  async generateInsight(sessionId, forceRegenerate = false) {
    const sessionPath = path.join(this.sessionDir, sessionId);
    const insightFile = path.join(sessionPath, 'insight-report.md');
    const lockFile = path.join(sessionPath, 'insight-report.md.lock');
    const eventsFile = path.join(sessionPath, 'events.jsonl');

    // Check if complete insight exists
    if (!forceRegenerate) {
      try {
        const report = await fs.readFile(insightFile, 'utf-8');
        const stats = await fs.stat(insightFile);
        return {
          status: 'completed',
          report,
          generatedAt: stats.mtime
        };
      } catch (_err) {
        // File doesn't exist, continue to generation
      }
    }

    // Check if generation is already in progress (atomic check)
    try {
      // Try to create lock file exclusively (fails if exists)
      await fs.writeFile(lockFile, JSON.stringify({
        sessionId,
        startTime: new Date().toISOString(),
        pid: process.pid
      }), { flag: 'wx' });
    } catch (err) {
      if (err.code === 'EEXIST') {
        // Another process is generating, check if it's stale
        try {
          const _lockData = JSON.parse(await fs.readFile(lockFile, 'utf-8'));
          const lockStats = await fs.stat(lockFile);
          const ageMs = Date.now() - lockStats.mtime.getTime();
          
          if (ageMs < config.INSIGHT_TIMEOUT_MS) {
            // Still valid, return generating status
            return {
              status: 'generating',
              report: '# Generating Copilot Insight...\n\nAnother request is currently generating this insight. Please wait.',
              startedAt: lockStats.birthtime,
              lastUpdate: lockStats.mtime
            };
          }
          
          // Stale lock, remove it
          console.log(`⚠️  Removing stale lock file (${Math.floor(ageMs/1000)}s old)`);
          await fs.unlink(lockFile);
          
          // Retry lock creation
          await fs.writeFile(lockFile, JSON.stringify({
            sessionId,
            startTime: new Date().toISOString(),
            pid: process.pid
          }), { flag: 'wx' });
        } catch (_retryErr) {
          throw new Error('Failed to acquire lock for insight generation', { cause: _retryErr });
        }
      } else {
        throw err;
      }
    }

    // Check if events file exists
    try {
      await fs.access(eventsFile);
    } catch (_err) {
      await fs.unlink(lockFile);
      throw new Error('Events file not found', { cause: _err });
    }

    // Clean up old files if force regenerate
    if (forceRegenerate) {
      try {
        await fs.unlink(insightFile);
      } catch (_err) {
        // File might not exist
      }
    }

    // Start generation
    await this._spawnCopilotProcess(sessionId, sessionPath, eventsFile, insightFile, lockFile);

    return {
      status: 'generating',
      report: '# Generating Copilot Insight...\n\nAnalysis in progress. Please wait.',
      startedAt: new Date()
    };
  }

  /**
   * Spawn copilot process safely (no shell)
   * @private
   */
  async _spawnCopilotProcess(sessionId, sessionPath, eventsFile, insightFile, lockFile) {
    const tmpDir = path.join(os.tmpdir(), `copilot-insight-${sessionId}-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true });

    const prompt = this._buildPrompt();
    const outputFile = path.join(sessionPath, 'insight-report.md.tmp');

    // Spawn copilot directly (no shell)
    const copilotPath = 'copilot';
    const args = ['--config-dir', tmpDir, '--yolo', '-p', prompt];
    
    // Use system PATH - copilot should be in the user's PATH
    const copilotProcess = spawn(copilotPath, args, {
      env: { ...process.env },
      cwd: sessionPath,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Register for cleanup
    processManager.register(copilotProcess, { name: `insight-${sessionId}` });

    // Pipe events file to stdin
    const eventsStream = fsSync.createReadStream(eventsFile);
    eventsStream.pipe(copilotProcess.stdin);

    // Capture output
    const outputStream = fsSync.createWriteStream(outputFile);
    copilotProcess.stdout.pipe(outputStream);

    // Capture stderr with size limit
    const stderrChunks = [];
    let stderrSize = 0;
    const MAX_STDERR = 64 * 1024; // 64KB cap

    copilotProcess.stderr.on('data', (data) => {
      if (stderrSize < MAX_STDERR) {
        stderrChunks.push(data);
        stderrSize += data.length;
      }
    });

    copilotProcess.on('close', async (code) => {
      try {
        outputStream.end();
        
        if (code !== 0) {
          const stderr = Buffer.concat(stderrChunks).toString('utf-8').slice(0, MAX_STDERR);
          console.error('❌ Copilot CLI failed:', stderr);
          await fs.writeFile(insightFile, 
            `# ❌ Generation Failed\n\n\`\`\`\n${stderr}\n\`\`\`\n`, 
            'utf-8'
          );
        } else {
          // Clean and finalize report
          let report = await fs.readFile(outputFile, 'utf-8');
          report = this._cleanReport(report);
          await fs.writeFile(insightFile, report, 'utf-8');
          console.log(`✅ Insight generated for session ${sessionId}`);
        }

        // Cleanup
        await fs.unlink(outputFile).catch(() => {});
        await fs.unlink(lockFile).catch(() => {});
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      } catch (err) {
        console.error('❌ Error finalizing insight:', err);
        await fs.unlink(lockFile).catch(() => {});
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    copilotProcess.on('error', async (err) => {
      console.error('❌ Failed to spawn copilot:', err);
      await fs.unlink(lockFile).catch(() => {});
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  }

  /**
   * Build insight generation prompt
   * @private
   */
  _buildPrompt() {
    return `Analyze this GitHub Copilot CLI session data (JSONL format, one event per line) and generate a deep, actionable insight report.

CRITICAL: Output ONLY the analysis report. Do NOT include thinking blocks, reasoning steps, or meta-commentary about your analysis process. Go straight to insights.

Focus on:
1. **Session Health Score** (0-100): Calculate based on success rate, completion rate, and performance
   - Red flags: error rate >50%, incomplete sub-agents, timeout patterns
   
2. **Critical Issues** (if any):
   - What went wrong and why (root cause analysis)
   - Impact on user workflow
   - Specific failing patterns (e.g., "all 'create' calls missing file_text parameter")

3. **Performance Bottlenecks**:
   - Slowest operations with timing data
   - Where LLM is spending most time
   - Tool execution delays vs LLM thinking time

4. **Sub-Agent Effectiveness**:
   - Which sub-agents succeeded/failed and why
   - Completion patterns and failure points
   - Resource utilization (tool calls per sub-agent)

5. **Tool Usage Intelligence**:
   - Most/least used tools
   - Error patterns per tool type
   - Unused but potentially helpful tools

6. **Workflow Recommendations**:
   - Actionable improvements (specific, not generic)
   - Configuration tuning suggestions
   - Anti-patterns detected

Use data-driven language with specific numbers. Be critical, not descriptive. Focus on "why" and "what to do" rather than "what happened".

Output in clean Markdown with ## headers. Keep it concise but insightful (<2000 words).`;
  }

  /**
   * Clean report output (remove thinking blocks, meta-commentary)
   * @private
   */
  _cleanReport(report) {
    // Remove <thinking>...</thinking> blocks
    report = report.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
    
    // Remove meta-commentary
    report = report.replace(/^(Let me analyze|I'll analyze|Analyzing|Here's my analysis of).*$/gm, '');
    
    // Trim excessive whitespace
    report = report.replace(/\n{3,}/g, '\n\n').trim();
    
    return report;
  }

  /**
   * Get insight status
   */
  async getInsightStatus(sessionId) {
    const sessionPath = path.join(this.sessionDir, sessionId);
    const insightFile = path.join(sessionPath, 'insight-report.md');
    const lockFile = path.join(sessionPath, 'insight-report.md.lock');

    try {
      const report = await fs.readFile(insightFile, 'utf-8');
      const stats = await fs.stat(insightFile);
      return {
        status: 'completed',
        report,
        generatedAt: stats.mtime
      };
    } catch (_err) {
      // Check if generation is in progress
      try {
        await fs.access(lockFile);
        const stats = await fs.stat(lockFile);
        return {
          status: 'generating',
          startedAt: stats.birthtime,
          lastUpdate: stats.mtime
        };
      } catch (_lockErr) {
        return { status: 'not_started' };
      }
    }
  }

  /**
   * Delete insight report
   */
  async deleteInsight(sessionId) {
    const sessionPath = path.join(this.sessionDir, sessionId);
    const insightFile = path.join(sessionPath, 'insight-report.md');
    
    try {
      await fs.unlink(insightFile);
      return { success: true };
    } catch (err) {
      if (err.code === 'ENOENT') {
        return { success: true, message: 'Insight file not found' };
      }
      throw err;
    }
  }
}

module.exports = InsightService;
