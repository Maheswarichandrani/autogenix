import { FileNode } from "./types";

/**
 * Sample file structure for the code preview IDE
 * This demonstrates a typical project structure with various file types
 */
export const samplePreviewFiles: FileNode[] = [
    {
        id: "src",
        name: "src",
        type: "folder",
        isExpanded: true,
        children: [
            {
                id: "agents",
                name: "agents",
                type: "folder",
                isExpanded: true,
                children: [
                    {
                        id: "planner-ts",
                        name: "planner.ts",
                        type: "file",
                        language: "typescript",
                        content: `import { Agent, AgentConfig } from '../core/types';
import { TaskQueue } from '../core/queue';

export interface PlannerConfig extends AgentConfig {
  maxTasks: number;
  priorityWeights: Record<string, number>;
}

export class PlannerAgent implements Agent {
  private config: PlannerConfig;
  private taskQueue: TaskQueue;

  constructor(config: PlannerConfig) {
    this.config = config;
    this.taskQueue = new TaskQueue(config.maxTasks);
  }

  async analyze(prompt: string): Promise<Plan> {
    // Break down the prompt into actionable tasks
    const tasks = await this.extractTasks(prompt);
    
    // Prioritize tasks based on dependencies
    const prioritizedTasks = this.prioritizeTasks(tasks);
    
    return {
      id: crypto.randomUUID(),
      tasks: prioritizedTasks,
      estimatedDuration: this.estimateDuration(prioritizedTasks),
      createdAt: new Date(),
    };
  }

  private async extractTasks(prompt: string): Promise<Task[]> {
    // AI-powered task extraction logic
    return [];
  }

  private prioritizeTasks(tasks: Task[]): Task[] {
    return tasks.sort((a, b) => {
      const weightA = this.config.priorityWeights[a.type] || 1;
      const weightB = this.config.priorityWeights[b.type] || 1;
      return weightB - weightA;
    });
  }

  private estimateDuration(tasks: Task[]): number {
    return tasks.reduce((total, task) => total + task.estimatedTime, 0);
  }
}`,
                    },
                    {
                        id: "coder-ts",
                        name: "coder.ts",
                        type: "file",
                        language: "typescript",
                        content: `import { Agent, AgentConfig } from '../core/types';
import { CodeGenerator } from '../core/generator';

export interface CoderConfig extends AgentConfig {
  language: string;
  framework?: string;
  styleGuide?: string;
}

export class CoderAgent implements Agent {
  private config: CoderConfig;
  private generator: CodeGenerator;

  constructor(config: CoderConfig) {
    this.config = config;
    this.generator = new CodeGenerator(config);
  }

  async execute(task: Task): Promise<CodeResult> {
    const { type, specification } = task;

    switch (type) {
      case 'component':
        return this.generateComponent(specification);
      case 'function':
        return this.generateFunction(specification);
      case 'api':
        return this.generateAPI(specification);
      default:
        throw new Error(\`Unknown task type: \${type}\`);
    }
  }

  private async generateComponent(spec: ComponentSpec): Promise<CodeResult> {
    const code = await this.generator.generate({
      type: 'component',
      name: spec.name,
      props: spec.props,
      template: this.getTemplate('component'),
    });

    return {
      files: [{ path: \`\${spec.name}.tsx\`, content: code }],
      dependencies: spec.dependencies || [],
    };
  }

  private async generateFunction(spec: FunctionSpec): Promise<CodeResult> {
    return this.generator.generateFunction(spec);
  }

  private async generateAPI(spec: APISpec): Promise<CodeResult> {
    return this.generator.generateAPI(spec);
  }

  private getTemplate(type: string): string {
    const templates = {
      component: 'react-functional',
      function: 'typescript-async',
      api: 'rest-endpoint',
    };
    return templates[type] || 'default';
  }
}`,
                    },
                    {
                        id: "redteam-ts",
                        name: "redteam.ts",
                        type: "file",
                        language: "typescript",
                        content: `import { Agent, SecurityReport } from '../core/types';

export interface RedTeamConfig {
  scanDepth: 'shallow' | 'deep' | 'comprehensive';
  ruleSets: string[];
  autoFix: boolean;
}

export class RedTeamAgent implements Agent {
  private config: RedTeamConfig;
  private vulnerabilityDB: VulnerabilityDatabase;

  constructor(config: RedTeamConfig) {
    this.config = config;
    this.vulnerabilityDB = new VulnerabilityDatabase();
  }

  async audit(codebase: Codebase): Promise<SecurityReport> {
    const vulnerabilities: Vulnerability[] = [];

    // Run security scans
    const sqlInjection = await this.scanSQLInjection(codebase);
    const xss = await this.scanXSS(codebase);
    const auth = await this.scanAuthIssues(codebase);

    vulnerabilities.push(...sqlInjection, ...xss, ...auth);

    // Generate fixes if autoFix is enabled
    const fixes = this.config.autoFix 
      ? await this.generateFixes(vulnerabilities)
      : [];

    return {
      score: this.calculateSecurityScore(vulnerabilities),
      vulnerabilities,
      fixes,
      timestamp: new Date(),
    };
  }

  private async scanSQLInjection(codebase: Codebase): Promise<Vulnerability[]> {
    // SQL injection detection logic
    return [];
  }

  private async scanXSS(codebase: Codebase): Promise<Vulnerability[]> {
    // XSS vulnerability detection
    return [];
  }

  private async scanAuthIssues(codebase: Codebase): Promise<Vulnerability[]> {
    // Authentication/authorization issue detection
    return [];
  }

  private calculateSecurityScore(vulnerabilities: Vulnerability[]): number {
    const weights = { critical: 40, high: 20, medium: 10, low: 5 };
    const deductions = vulnerabilities.reduce((sum, v) => 
      sum + (weights[v.severity] || 0), 0
    );
    return Math.max(0, 100 - deductions);
  }

  private async generateFixes(vulnerabilities: Vulnerability[]): Promise<Fix[]> {
    return vulnerabilities.map(v => ({
      vulnerabilityId: v.id,
      patch: this.vulnerabilityDB.getFix(v.type),
      automated: true,
    }));
  }
}`,
                    },
                    {
                        id: "pipeline-ts",
                        name: "pipeline.ts",
                        type: "file",
                        language: "typescript",
                        content: `import { Agent, DeploymentResult } from '../core/types';

export interface PipelineConfig {
  stages: PipelineStage[];
  environment: 'development' | 'staging' | 'production';
  notifications: NotificationConfig;
}

export class PipelineAgent implements Agent {
  private config: PipelineConfig;
  private currentStage: number = 0;

  constructor(config: PipelineConfig) {
    this.config = config;
  }

  async deploy(build: Build): Promise<DeploymentResult> {
    const results: StageResult[] = [];

    for (const stage of this.config.stages) {
      this.currentStage++;
      
      try {
        const result = await this.executeStage(stage, build);
        results.push(result);

        if (!result.success) {
          await this.rollback(results);
          return this.createFailedResult(results, stage.name);
        }
      } catch (error) {
        await this.handleError(error, stage);
        return this.createFailedResult(results, stage.name);
      }
    }

    await this.notify('success', build);
    
    return {
      success: true,
      stages: results,
      url: this.getDeploymentURL(build),
      timestamp: new Date(),
    };
  }

  private async executeStage(stage: PipelineStage, build: Build): Promise<StageResult> {
    console.log(\`Executing stage: \${stage.name}\`);
    
    switch (stage.type) {
      case 'build':
        return this.runBuild(build);
      case 'test':
        return this.runTests(build);
      case 'deploy':
        return this.runDeploy(build);
      default:
        throw new Error(\`Unknown stage type: \${stage.type}\`);
    }
  }

  private async rollback(results: StageResult[]): Promise<void> {
    // Rollback logic for failed deployments
    console.log('Rolling back deployment...');
  }

  private async notify(status: string, build: Build): Promise<void> {
    // Send notifications via configured channels
  }

  private getDeploymentURL(build: Build): string {
    const envSubdomain = this.config.environment === 'production' ? '' : \`\${this.config.environment}.\`;
    return \`https://\${envSubdomain}\${build.projectName}.nexus.app\`;
  }
}`,
                    },
                ],
            },
            {
                id: "core",
                name: "core",
                type: "folder",
                isExpanded: true,
                children: [
                    {
                        id: "engine-ts",
                        name: "engine.ts",
                        type: "file",
                        language: "typescript",
                        content: `import { PlannerAgent } from './agents/planner';
import { CoderAgent } from './agents/coder';
import { RedTeamAgent } from './agents/redteam';
import { PipelineAgent } from './agents/pipeline';
import { DebateEngine } from './core/debate';

export class ShipyardEngine {
  private planner: PlannerAgent;
  private coder: CoderAgent;
  private redTeam: RedTeamAgent;
  private pipeline: PipelineAgent;
  private debateEngine: DebateEngine;

  constructor(config: ShipyardConfig) {
    this.planner = new PlannerAgent(config);
    this.coder = new CoderAgent(config);
    this.redTeam = new RedTeamAgent(config);
    this.pipeline = new PipelineAgent(config);
    this.debateEngine = new DebateEngine({
      agents: [this.planner, this.coder, this.redTeam],
      maxRounds: config.maxDebateRounds ?? 3,
    });
  }

  async build(prompt: string): Promise<BuildResult> {
    // Phase 1: Plan
    const plan = await this.planner.analyze(prompt);
    
    // Phase 2: Generate Code
    const codeResults = await Promise.all(
      plan.tasks.map(task => this.coder.execute(task))
    );
    
    // Phase 3: Security Audit
    const securityReport = await this.redTeam.audit({
      files: codeResults.flatMap(r => r.files),
    });
    
    // Phase 4: Debate & Refine (if needed)
    if (securityReport.score < 80) {
      const refinedCode = await this.debateEngine.resolve({
        issue: 'security',
        context: securityReport,
      });
      // Apply refinements...
    }
    
    // Phase 5: Deploy
    const deployment = await this.pipeline.deploy({
      projectName: plan.id,
      files: codeResults.flatMap(r => r.files),
    });
    
    return {
      plan,
      code: codeResults,
      security: securityReport,
      deployment,
    };
  }
}`,
                    },
                    {
                        id: "debate-ts",
                        name: "debate.ts",
                        type: "file",
                        language: "typescript",
                        content: `import { Agent } from './types';

interface DebateConfig {
  agents: Agent[];
  maxRounds: number;
  consensusThreshold?: number;
}

interface DebateContext {
  issue: string;
  context: unknown;
}

interface Resolution {
  consensus: boolean;
  solution: unknown;
  rounds: DebateRound[];
}

interface DebateRound {
  round: number;
  proposals: AgentProposal[];
  winner?: string;
}

export class DebateEngine {
  private agents: Agent[];
  private maxRounds: number;
  private consensusThreshold: number;

  constructor(config: DebateConfig) {
    this.agents = config.agents;
    this.maxRounds = config.maxRounds;
    this.consensusThreshold = config.consensusThreshold ?? 0.8;
  }

  async resolve(context: DebateContext): Promise<Resolution> {
    const rounds: DebateRound[] = [];
    let consensus = false;
    let currentSolution: unknown = null;

    for (let round = 1; round <= this.maxRounds && !consensus; round++) {
      // Gather proposals from all agents
      const proposals = await this.gatherProposals(context);
      
      // Evaluate proposals
      const evaluation = await this.evaluateProposals(proposals);
      
      rounds.push({
        round,
        proposals,
        winner: evaluation.winner,
      });

      // Check for consensus
      if (evaluation.agreementScore >= this.consensusThreshold) {
        consensus = true;
        currentSolution = evaluation.solution;
      } else {
        // Update context for next round
        context = this.updateContext(context, evaluation);
      }
    }

    return {
      consensus,
      solution: currentSolution,
      rounds,
    };
  }

  private async gatherProposals(context: DebateContext): Promise<AgentProposal[]> {
    return Promise.all(
      this.agents.map(async (agent) => ({
        agentId: agent.id,
        proposal: await agent.propose?.(context) ?? null,
        confidence: await agent.getConfidence?.(context) ?? 0.5,
      }))
    );
  }

  private async evaluateProposals(proposals: AgentProposal[]) {
    // Implement evaluation logic
    const scores = proposals.map(p => p.confidence);
    const maxScore = Math.max(...scores);
    const winner = proposals.find(p => p.confidence === maxScore);

    return {
      winner: winner?.agentId,
      solution: winner?.proposal,
      agreementScore: this.calculateAgreement(proposals),
    };
  }

  private calculateAgreement(proposals: AgentProposal[]): number {
    // Calculate how much agents agree on the solution
    return proposals.reduce((sum, p) => sum + p.confidence, 0) / proposals.length;
  }

  private updateContext(context: DebateContext, evaluation: any): DebateContext {
    return {
      ...context,
      previousRound: evaluation,
    };
  }
}`,
                    },
                ],
            },
            {
                id: "main-ts",
                name: "main.ts",
                type: "file",
                language: "typescript",
                content: `import { ShipyardEngine } from './core/engine';

async function main() {
  const engine = new ShipyardEngine({
    projectName: 'nexus-demo',
    environment: 'development',
    maxDebateRounds: 3,
    agents: {
      planner: { maxTasks: 10 },
      coder: { language: 'typescript', framework: 'next' },
      redTeam: { scanDepth: 'deep', autoFix: true },
      pipeline: { stages: ['build', 'test', 'deploy'] },
    },
  });

  try {
    const result = await engine.build(\`
      Create a modern e-commerce dashboard with:
      - Product management CRUD
      - Order tracking system
      - Analytics dashboard
      - User authentication
      - Responsive design
    \`);

    console.log('Build completed!');
    console.log('Security Score:', result.security.score);
    console.log('Deployment URL:', result.deployment.url);
    
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();`,
            },
        ],
    },
    {
        id: "config-ts",
        name: "config.ts",
        type: "file",
        language: "typescript",
        content: `export interface ShipyardConfig {
  projectName: string;
  environment: 'development' | 'staging' | 'production';
  maxDebateRounds?: number;
  agents: {
    planner: PlannerConfig;
    coder: CoderConfig;
    redTeam: RedTeamConfig;
    pipeline: PipelineConfig;
  };
}

export interface PlannerConfig {
  maxTasks: number;
  priorityWeights?: Record<string, number>;
}

export interface CoderConfig {
  language: string;
  framework?: string;
  styleGuide?: string;
}

export interface RedTeamConfig {
  scanDepth: 'shallow' | 'deep' | 'comprehensive';
  ruleSets?: string[];
  autoFix?: boolean;
}

export interface PipelineConfig {
  stages: string[];
  notifications?: NotificationConfig;
}

export interface NotificationConfig {
  slack?: string;
  email?: string[];
  webhook?: string;
}

export const defaultConfig: ShipyardConfig = {
  projectName: 'untitled',
  environment: 'development',
  maxDebateRounds: 3,
  agents: {
    planner: { maxTasks: 20 },
    coder: { language: 'typescript', framework: 'react' },
    redTeam: { scanDepth: 'deep', autoFix: true },
    pipeline: { stages: ['lint', 'test', 'build', 'deploy'] },
  },
};`,
    },
    {
        id: "package-json",
        name: "package.json",
        type: "file",
        language: "json",
        content: `{
  "name": "@nexus/shipyard-engine",
  "version": "1.4.2",
  "description": "AI-powered autonomous code generation engine",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc && npm run build:types",
    "build:types": "tsc --emitDeclarationOnly",
    "test": "vitest",
    "test:coverage": "vitest --coverage",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "@openai/api": "^4.0.0",
    "zod": "^3.22.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "vitest": "^2.0.0",
    "eslint": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}`,
    },
    {
        id: "tsconfig-json",
        name: "tsconfig.json",
        type: "file",
        language: "json",
        content: `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}`,
    },
    {
        id: "readme-md",
        name: "README.md",
        type: "file",
        language: "markdown",
        content: `# Shipyard Engine

> Autonomous AI-powered code generation and deployment engine.

## Overview

Shipyard Engine orchestrates multiple AI agents to build, review, and deploy
production-ready applications from natural language descriptions.

## Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                     Shipyard Engine                         │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Planner │──│  Coder  │──│ RedTeam │──│Pipeline │        │
│  │  Agent  │  │  Agent  │  │  Agent  │  │  Agent  │        │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘        │
│       │            │            │            │              │
│       └────────────┴────────────┴────────────┘              │
│                         │                                   │
│                  ┌──────┴──────┐                            │
│                  │   Debate    │                            │
│                  │   Engine    │                            │
│                  └─────────────┘                            │
└─────────────────────────────────────────────────────────────┘
\`\`\`

## Agent Squads

### 🎯 Planner Agent
Analyzes prompts and creates structured task plans with priorities.

### 💻 Coder Agent
Generates production-quality code following best practices.

### 🔒 RedTeam Agent
Performs security audits and generates automated fixes.

### 🚀 Pipeline Agent
Orchestrates build, test, and deployment workflows.

## Quick Start

\`\`\`typescript
import { ShipyardEngine } from '@nexus/shipyard-engine';

const engine = new ShipyardEngine({
  projectName: 'my-app',
  environment: 'development',
});

const result = await engine.build('Create a REST API for user management');
console.log(result.deployment.url);
\`\`\`

## License

MIT © Nexus AI
`,
    },
];
