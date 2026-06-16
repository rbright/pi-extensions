import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type SessionManagerLike = {
  getSessionFile?: () => string | undefined;
};

type ToolCallEventLike = {
  toolName?: unknown;
};

type BeforeAgentStartEventLike = {
  systemPrompt?: unknown;
};

type CommandContextLike = {
  sessionManager?: SessionManagerLike;
  ui?: {
    notify?: (message: string, level?: 'info' | 'warning' | 'error') => void;
  };
};

type ExtensionAPILike = {
  on: (eventName: string, handler: unknown) => void;
};

type OrchestratorGuardConfig = {
  enabled: boolean;
  blockedTools: string[];
  bypassEnv: string;
  subagentSessionPathFragment: string;
};

const DEFAULT_CONFIG_PATH = join(homedir(), '.pi', 'agent', 'orchestrator-guard.json');
const ROOT_WORKFLOW_GUIDANCE = `# Root Orchestrator Workflow

- Before delegating non-trivial planning or execution, ask the user at least one high-leverage clarifying question.
- The root session owns grill-me, ask_user_question, and approval; do not delegate those waits.
- Delegated planners must return the next grill question for root to ask instead of waiting on the user themselves.
- Do not create or use generic scratch/state filenames such as plan.md, context.md, or session.md.`;

const DEFAULT_CONFIG: OrchestratorGuardConfig = {
  enabled: true,
  blockedTools: [
    'bash',
    'edit',
    'write',
    'mcp',
    'web_search',
    'web_fetch',
    'ctx_execute',
    'ctx_batch_execute',
    'ctx_execute_file',
    'ctx_fetch_and_index',
    'ctx_index',
    'ctx_search',
  ],
  bypassEnv: 'PI_ORCHESTRATOR_GUARD_DISABLED',
  subagentSessionPathFragment: '/sessions/subagent/',
};

function getConfigPath(): string {
  return process.env.PI_ORCHESTRATOR_GUARD_CONFIG || DEFAULT_CONFIG_PATH;
}

function loadConfig(configPath = getConfigPath()): OrchestratorGuardConfig {
  if (!existsSync(configPath)) return DEFAULT_CONFIG;

  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<OrchestratorGuardConfig>;
    return {
      enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
      blockedTools: Array.isArray(parsed.blockedTools)
        ? parsed.blockedTools.filter((tool): tool is string => typeof tool === 'string')
        : DEFAULT_CONFIG.blockedTools,
      bypassEnv: typeof parsed.bypassEnv === 'string' && parsed.bypassEnv ? parsed.bypassEnv : DEFAULT_CONFIG.bypassEnv,
      subagentSessionPathFragment:
        typeof parsed.subagentSessionPathFragment === 'string' && parsed.subagentSessionPathFragment
          ? parsed.subagentSessionPathFragment
          : DEFAULT_CONFIG.subagentSessionPathFragment,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

function isSubagentSession(sessionFile: string | undefined, config: OrchestratorGuardConfig): boolean {
  return Boolean(sessionFile && sessionFile.includes(config.subagentSessionPathFragment));
}

function shouldBlockTool(toolName: string, config: OrchestratorGuardConfig, sessionFile?: string): boolean {
  if (!config.enabled) return false;
  if (process.env[config.bypassEnv] === '1') return false;
  if (isSubagentSession(sessionFile, config)) return false;
  return config.blockedTools.includes(toolName);
}

function shouldInjectWorkflowGuidance(config: OrchestratorGuardConfig, sessionFile?: string): boolean {
  if (!config.enabled) return false;
  if (process.env[config.bypassEnv] === '1') return false;
  return !isSubagentSession(sessionFile, config);
}

function appendWorkflowGuidance(systemPrompt: string): string {
  if (systemPrompt.includes(ROOT_WORKFLOW_GUIDANCE)) return systemPrompt;
  return `${systemPrompt}\n\n${ROOT_WORKFLOW_GUIDANCE}`;
}

function notify(ctx: CommandContextLike, message: string): void {
  ctx.ui?.notify?.(message, 'warning');
}

function registerOrchestratorGuard(pi: ExtensionAPI): void {
  const untypedPi = pi as unknown as ExtensionAPILike;

  untypedPi.on(
    'before_agent_start',
    async (event: BeforeAgentStartEventLike, ctx: { sessionManager: SessionManagerLike }) => {
      const config = loadConfig();
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      if (!shouldInjectWorkflowGuidance(config, sessionFile)) return;

      const systemPrompt = typeof event.systemPrompt === 'string' ? event.systemPrompt : '';
      return { systemPrompt: appendWorkflowGuidance(systemPrompt) };
    },
  );

  untypedPi.on(
    'tool_call',
    async (event: ToolCallEventLike, ctx: { sessionManager: SessionManagerLike; ui?: CommandContextLike['ui'] }) => {
      const toolName = typeof event.toolName === 'string' ? event.toolName : undefined;
      if (!toolName) return;

      const config = loadConfig();
      const sessionFile = ctx.sessionManager.getSessionFile?.();
      if (!shouldBlockTool(toolName, config, sessionFile)) return;

      const reason = `Orchestrator guard: delegate ${toolName} to a subagent or chain; the root session is for clarification, routing, and summaries.`;
      notify(ctx as CommandContextLike, reason);
      return { block: true, reason };
    },
  );
}

export {
  appendWorkflowGuidance,
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_PATH,
  getConfigPath,
  isSubagentSession,
  loadConfig,
  registerOrchestratorGuard as default,
  ROOT_WORKFLOW_GUIDANCE,
  shouldBlockTool,
  shouldInjectWorkflowGuidance,
  type OrchestratorGuardConfig,
};
