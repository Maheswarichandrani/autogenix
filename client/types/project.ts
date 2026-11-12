/**
 * Project types matching the backend SQLAlchemy Project model
 * and ProjectResponse schema
 */

export type ProjectStack = {
  framework?: string;
  [key: string]: unknown;
};

export interface Project {
  id: string; // UUID
  name: string;
  description?: string | null;

  // Status and metadata
  status: string; // "active" | "deleted" etc.
  stack?: ProjectStack | null;

  // Git & Deployment
  repo_url?: string | null;
  latest_deploy_url?: string | null;

  /** List endpoint only: what the project is doing now (sidebar dot) */
  activity?: ProjectActivity | null;

  // LangGraph integration
  langgraph_thread_id?: string | null;

  // Timestamps
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
}

/**
 * Create project form data — matches ProjectCreate schema
 */
export interface CreateProjectData {
  name?: string | null;
  description?: string | null;
  user_prompt?: string | null;
}

/**
 * Update project data — matches ProjectUpdate schema
 */
export interface UpdateProjectData {
  name?: string;
  description?: string;
  status?: string;
  stack?: ProjectStack;
  repo_url?: string;
  latest_deploy_url?: string;
}

/**
 * Paginated project list response — matches ProjectListResponse schema
 */
export interface ProjectListResponse {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Project query parameters
 */
export interface ProjectListParams {
  page?: number;
  limit?: number;
  status?: string;
}

export type ProjectActivity = "building" | "awaiting_deploy" | "deployed";
