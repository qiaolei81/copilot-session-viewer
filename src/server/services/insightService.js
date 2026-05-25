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
  constructor() {
    // No longer needs session directories - paths are passed directly
  }

  /**
   * Get CLI tool configuration based on session source
   * @private
   */
  _getToolConfig(source, sessionPath) {
    const configs = {
      copilot: {
        name: 'Copilot',
        cli: 'copilot',
        args: (tmpDir, prompt) => ['--config-dir', tmpDir, '--yolo', '-p', prompt],
        cwd: sessionPath
      },
      vscode: {
        name: 'Copilot',
        cli: 'copilot',
        args: (tmpDir, prompt) => ['--config-dir', tmpDir, '--yolo', '-p', prompt],
        cwd: sessionPath
      },
      claude: {
        name: 'Claude Code',
        cli: 'claude',
        args: (_tmpDir, prompt) => ['-p', prompt, '--dangerously-skip-permissions'],
        cwd: sessionPath
      },
      'pi-mono': {
        name: 'Pi',
        cli: 'pi',
        args: (_tmpDir, prompt) => ['-p', prompt],
        cwd: sessionPath
      }
    };

    return configs[source] || configs.copilot; // fallback to copilot
  }

  /**
   * Generate or retrieve insight report
   * @param {string} sessionId - Session ID
   * @param {string} sessionPath - Full path to session directory
   * @param {string} source - Session source: 'copilot', 'claude', or 'pi-mono'
   * @param {boolean} forceRegenerate - Force new generation
   * @returns {Promise<Object>} Insight status and report
   */
  async generateInsight(sessionId, sessionPath, source = 'copilot', forceRegenerate = false) {
    // Use per-session insight file to avoid collisions in shared directories
    const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
    const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
    
    // Determine events file location based on directory structure
    // Try standard events.jsonl first, then <sessionId>.jsonl (for file-type sessions),
    // finally *_<sessionId>.jsonl (for Pi-Mono timestamped sessions)
    let eventsFile = path.join(sessionPath, 'events.jsonl');
    try {
      await fs.access(eventsFile);
    } catch {
      // Try <sessionId>.jsonl (common for Claude file-type sessions)
      try {
        eventsFile = path.join(sessionPath, `${sessionId}.jsonl`);
        await fs.access(eventsFile);
      } catch {
        // Try *_<sessionId>.jsonl (Pi-Mono format: YYYY-MM-DDTHH-mm-ss-SSSZ_<uuid>.jsonl)
        const entries = await fs.readdir(sessionPath);
        const piFile = entries.find(f => f.endsWith(`_${sessionId}.jsonl`));
        if (piFile) {
          eventsFile = path.join(sessionPath, piFile);
        }
      }
    }

    const toolConfig = this._getToolConfig(source, sessionPath);
    const toolName = toolConfig.name;

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
              report: `# Generating ${toolName} Insight...\n\nAnother request is currently generating this insight. Please wait.`,
              startedAt: lockStats.birthtime,
              lastUpdate: lockStats.mtime,
              ageMs: Date.now() - lockStats.birthtime.getTime()
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
    await this._spawnAnalysisProcess(sessionPath, eventsFile, insightFile, lockFile, toolConfig);

    return {
      status: 'generating',
      report: `# Generating ${toolName} Insight...\n\nAnalysis in progress. Please wait.`,
      startedAt: new Date()
    };
  }

  /**
   * Spawn analysis process safely (no shell)
   * @private
   */
  async _spawnAnalysisProcess(sessionPath, eventsFile, insightFile, lockFile, toolConfig) {
    const sessionId = path.basename(sessionPath); // Extract session ID from path
    const tmpDir = path.join(os.tmpdir(), `agent-review-${sessionId}-${Date.now()}`);
    await fs.mkdir(tmpDir, { recursive: true});

    const prompt = this._buildPrompt(insightFile, eventsFile);
    const outputFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);

    // Spawn analysis tool directly (no shell)
    const cliPath = toolConfig.cli;
    const args = toolConfig.args(tmpDir, prompt);
    
    console.log(`🤖 Starting ${toolConfig.name} analysis: ${cliPath} ${args.slice(0, 2).join(' ')}...`);
    console.log(`📋 Args count: ${args.length}, prompt length: ${prompt.length} chars`);
    
    // Use system PATH - CLI should be in the user's PATH
    const analysisProcess = spawn(cliPath, args, {
      env: { ...process.env },
      cwd: sessionPath,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Register for cleanup
    processManager.register(analysisProcess, { name: `insight-${sessionId}` });

    // Pipe events file to stdin (for tools that read from stdin like copilot)
    // Claude Code and Pi read files directly, so they don't need stdin
    if (toolConfig.cli === 'copilot') {
      const eventsStream = fsSync.createReadStream(eventsFile);
      // Handle EPIPE: if process exits before stdin is fully written, suppress the error
      analysisProcess.stdin.on('error', (err) => {
        if (err.code === 'EPIPE') {
          eventsStream.destroy();
        } else {
          console.error('❌ stdin error:', err);
        }
      });
      eventsStream.pipe(analysisProcess.stdin);
    } else {
      // Close stdin for tools that don't need it
      analysisProcess.stdin.end();
    }

    // Capture output
    const outputStream = fsSync.createWriteStream(outputFile);
    analysisProcess.stdout.pipe(outputStream);

    // Capture stderr with size limit
    const stderrChunks = [];
    let stderrSize = 0;
    const MAX_STDERR = 64 * 1024; // 64KB cap

    analysisProcess.stderr.on('data', (data) => {
      if (stderrSize < MAX_STDERR) {
        stderrChunks.push(data);
        stderrSize += data.length;
      }
    });

    analysisProcess.on('close', async (code) => {
      try {
        outputStream.end();

        const stderr = Buffer.concat(stderrChunks).toString('utf-8').slice(0, MAX_STDERR);
        console.log(`📋 ${toolConfig.name} process exited with code ${code}`);
        if (stderr) {
          console.log(`📋 ${toolConfig.name} stderr:`, stderr.substring(0, 500));
        }

        if (code !== 0) {
          console.error(`❌ ${toolConfig.name} CLI failed (code ${code}):`, stderr);
          await fs.writeFile(insightFile,
            `# ❌ Generation Failed\n\nExit code: ${code}\n\n\`\`\`\n${stderr || '(no error output)'}\n\`\`\`\n`,
            'utf-8'
          );
        } else {
          // The agent was told to write directly to insightFile.
          // Check if it did; if not, fall back to cleaning stdout from .tmp.
          let hasDirectOutput = false;
          try {
            const direct = await fs.readFile(insightFile, 'utf-8');
            if (direct && direct.trim().length > 50) {
              hasDirectOutput = true;
              console.log(`✅ Insight generated for session ${sessionId} (agent wrote directly)`);
            }
          } catch (_e) { /* file doesn't exist */ }

          if (!hasDirectOutput) {
            let report = await fs.readFile(outputFile, 'utf-8');
            report = this._cleanReport(report);
            await fs.writeFile(insightFile, report, 'utf-8');
            console.log(`✅ Insight generated for session ${sessionId} (cleaned from stdout)`);
          }
        }

        // Cleanup
        await fs.unlink(outputFile).catch(() => {});
        await fs.unlink(lockFile).catch(() => {});
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
        // Clean up sub-agent working directory (safety net)
        await fs.rm(path.join(sessionPath, '.output'), { recursive: true, force: true }).catch(() => {});
      } catch (err) {
        console.error('❌ Error finalizing insight:', err);
        await fs.unlink(lockFile).catch(() => {});
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      }
    });

    analysisProcess.on('error', async (err) => {
      console.error(`❌ Failed to spawn ${toolConfig.name}:`, err);
      await fs.unlink(lockFile).catch(() => {});
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    });
  }

  /**
   * Build insight generation prompt
   * @private
   */
  _buildPrompt(outputPath, eventsFile) {
    const sessionDir = path.dirname(outputPath);
    const eventsFilename = path.basename(eventsFile);
    const workDir = `${sessionDir}/.output`;
    
    // For Pi-Mono: emphasize analyzing ONLY the specified file
    const fileInstruction = eventsFilename.includes('_') 
      ? `\n**IMPORTANT**: This directory may contain multiple .jsonl files. You MUST analyze ONLY the file named \`${eventsFilename}\`. Do NOT read or analyze any other .jsonl files in this directory.\n`
      : '';
    
    return `You are an expert AI agent prompt-compliance auditor. The current working directory is an AI coding agent session folder containing raw session data from an agent run.
${fileInstruction}
**Step 1 — Discover session files.** Run \`ls -la\` to see what's available:
- \`${eventsFilename}\` — the main session event log (JSONL, one JSON event per line). **This is the ONLY events file you should analyze.**
- \`plan.md\` — the agent's plan (if it exists).
- \`workspace.yaml\` — workspace configuration (if it exists).

**Step 2 — Extract prompts and execution trace.** Parse \`${eventsFilename}\` to extract:
- The **system prompt** (the agent's instructions/rules/constraints)
- The **user prompt** (what the user actually asked for)
- The **execution trace** — what the agent actually did (tool calls, decisions, outputs)
- All **build/test/compile** operations and their exit codes, stdout/stderr

**Step 3 — Spawn 3 sub-agents for parallel analysis.** First create the working directory: \`mkdir -p ${workDir}\`. Then use the Task tool to launch ALL of the following sub-agents simultaneously. Each sub-agent should read \`${eventsFilename}\` from \`${sessionDir}\` (use Bash: \`cat\`, \`jq\`, or \`python3\` to parse) **— ONLY this file, ignore others**.

Sub-agents to spawn:

1. **Prompt Compliance Analyst** — Extract the system prompt rules/constraints and check each against the execution trace. For each rule: was it followed, partially followed, or violated? Identify instructions the agent ignored and actions the agent took that weren't requested. Write findings to \`${workDir}/compliance.md\`.

2. **Task Completion Analyst** — Compare the user's ask against the agent's final output/artifacts. Did the agent deliver what was asked? Did it go off-track, do extra unrequested work, or miss requirements? Evaluate the logical coherence of the agent's plan-to-execution flow. Write findings to \`${workDir}/task.md\`.

3. **Build & Test Analyst** — Find ALL build, compile, test, lint operations in the trace. For each: extract the command, exit code, and key output lines. For failures: diagnose root cause (missing dependency? syntax error? test assertion? wrong config?). Track if the agent fixed failures or left them broken. Write findings to \`${workDir}/buildtest.md\`.

**CRITICAL: You MUST wait for ALL 3 sub-agents to complete before proceeding to Step 4.** Do NOT move on until every sub-agent has returned its results.

**Step 4 — Synthesize the final report.** Once all sub-agents are done:
1. Read the intermediate files from \`${workDir}/\`
2. Synthesize a unified report
3. Write the final report to \`${outputPath}\`
4. Clean up: \`rm -rf ${workDir}\`

The final report MUST follow this exact structure:

---

## 📊 Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| System Prompt Compliance | X/10 | one-line summary |
| User Ask Alignment | X/10 | one-line summary |
| Execution Consistency | X/10 | one-line summary |
| Error Recovery | X/10 | one-line summary |

**Overall: X/10**

## 🔨 Build & Test Results

For each build/test operation found in the session, list:
- Command, exit code, pass/fail
- For failures: root cause in one sentence
- Final state: all green, or what's still broken

If no build/test operations exist, state "No build/test operations found in this session."

## 📋 System Prompt Compliance

List the key rules/constraints from the system prompt. For each:
- ✅ Followed — with brief evidence
- ⚠️ Partially followed — what was missed
- ❌ Violated — what happened instead

Focus on rules that were violated or partially followed. Don't exhaustively list every rule that was trivially followed.

## 🎯 User Ask Alignment

- What the user asked for (summarize the ask)
- What the agent actually delivered
- Gap analysis: missing deliverables, extra unrequested work, misinterpretations

## 🔄 Execution Consistency

- Did the agent's execution match its own stated plan?
- Any backtracking, contradictions, or abandoned approaches?
- Were decisions internally consistent throughout the session?

## 💡 Key Findings

Top 3-5 specific, evidence-backed observations. Every finding must reference concrete events from the session trace (tool call IDs, timestamps, or quoted output). No generic advice.

---

IMPORTANT CONSTRAINTS:
- Be precise and concise. Every sentence must carry data or actionable insight.
- The scorecard dimensions are the backbone — all analysis must map back to them.
- Always cite evidence from the session trace. "The agent violated rule X" is useless without showing where.
- The entire report should be under 4000 characters.`;
  }

  /**
   * Clean report output — strip copilot CLI working logs, thinking blocks, meta-commentary.
   * The copilot CLI dumps tool call logs (● Tool name, $ command, └ output) to stdout
   * alongside the actual report. We need to extract just the final markdown.
   * @private
   */
  _cleanReport(report) {
    // Remove <thinking>...</thinking> blocks
    report = report.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');

    // Remove meta-commentary lines
    report = report.replace(/^(Let me analyze|I'll analyze|Analyzing|Here's my analysis of|I need the session data).*$/gm, '');

    // Strategy: try to find the final markdown report section.
    // The copilot CLI log has patterns like:
    //   ● Tool name            (tool call header)
    //   $ command              (bash command)
    //   └ N lines...           (output summary)
    //   (+N lines)             (file write indicator)
    // The actual report starts with a markdown heading like "## 🎯"

    // Look for the last occurrence of the report structure (## 🎯 Effectiveness Score)
    // which indicates the final output vs. intermediate attempts
    const reportStartPattern = /^## 📊\s*Scorecard/m;
    const matches = [...report.matchAll(new RegExp(reportStartPattern.source, 'gm'))];

    if (matches.length > 0) {
      // Take from the last match onward (in case the agent generated it multiple times)
      const lastMatch = matches[matches.length - 1];
      report = report.slice(lastMatch.index);
    } else {
      // Try broader: find any markdown heading (## with emoji or #)
      const anyHeadingMatch = report.match(/^(## [🎯🔧🔄⚡💡#])/mu);
      if (anyHeadingMatch) {
        report = report.slice(anyHeadingMatch.index);
      } else {
        // Last resort: strip known copilot CLI log patterns line by line
        const lines = report.split('\n');
        const cleanedLines = [];
        let skipBlock = false;

        for (const line of lines) {
          // Skip copilot CLI working log patterns
          if (/^● /.test(line)) { skipBlock = true; continue; }
          if (/^ {2}\$ /.test(line)) { skipBlock = true; continue; }
          if (/^ {2}└ /.test(line)) { skipBlock = false; continue; }
          if (/^\(\+\d+ lines?\)/.test(line)) { continue; }
          if (/^ {2}└ \d+ lines/.test(line)) { continue; }
          // Skip "Asked user" and "User responded" log lines
          if (/^● Asked user:/.test(line)) { skipBlock = true; continue; }
          if (/^ {2}└ User responded:/.test(line)) { skipBlock = false; continue; }

          // If we hit a non-log line, stop skipping
          if (skipBlock && /\S/.test(line) && !/^ {2}/.test(line)) {
            skipBlock = false;
          }
          if (skipBlock) continue;

          cleanedLines.push(line);
        }
        report = cleanedLines.join('\n');
      }
    }

    // Trim excessive whitespace
    report = report.replace(/\n{3,}/g, '\n\n').trim();

    return report;
  }

  /**
   * Get insight status
   */
  /**
   * Get insight status
   * @param {string} sessionId - Session ID
   * @param {string} sessionPath - Full path to session directory
   * @param {string} source - Session source
   * @returns {Promise<Object>} Status object
   */
  async getInsightStatus(sessionId, sessionPath, _source = 'copilot') {
    return await this._getStatusForSource(sessionId, sessionPath);
  }

  /**
   * Get status for a specific session directory
   * @private
   */
  async _getStatusForSource(sessionId, sessionPath) {
    const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);
    const lockFile = path.join(sessionPath, `${sessionId}.agent-review.md.lock`);
    const tmpFile = path.join(sessionPath, `${sessionId}.agent-review.md.tmp`);

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
        const ageMs = Date.now() - stats.birthtime.getTime();

        // Read live working log from tmp file
        let log = null;
        try {
          log = await fs.readFile(tmpFile, 'utf-8');
        } catch (_tmpErr) {
          // tmp file may not exist yet
        }

        if (ageMs >= config.INSIGHT_TIMEOUT_MS) {
          return {
            status: 'timeout',
            log,
            startedAt: stats.birthtime,
            lastUpdate: stats.mtime,
            ageMs
          };
        }

        return {
          status: 'generating',
          log,
          startedAt: stats.birthtime,
          lastUpdate: stats.mtime,
          ageMs
        };
      } catch (_lockErr) {
        return { status: 'not_started' };
      }
    }
  }

  /**
   * Delete insight report
   * @param {string} sessionId - Session ID
   * @param {string} sessionPath - Full path to session directory
   * @param {string} source - Session source
   * @returns {Promise<Object>} Result object
   */
  async deleteInsight(sessionId, sessionPath, _source = 'copilot') {
    const insightFile = path.join(sessionPath, `${sessionId}.agent-review.md`);

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
