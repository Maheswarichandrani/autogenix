/**
 * lib/api/config.ts
 * 
 * API configuration and endpoints
 */

export const API_CONFIG = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  timeout: 30000, // 30 seconds
} as const;

/**
 * API endpoints - centralized for easy management
 */
export const API_ENDPOINTS = {
  // Auth & Users
  users: {
    signIn: "/api/v1/users/signin",
    me: "/api/v1/users/me",
    onboarding: "/api/v1/users/onboarding/complete",
  },

  // Projects
  projects: {
    list: "/api/v1/projects",
    create: "/api/v1/projects",
    byId: (id: string) => `/api/v1/projects/${id}`,
    files: (id: string) => `/api/v1/projects/${id}/files`,
    update: (id: string) => `/api/v1/projects/${id}`,
    delete: (id: string) => `/api/v1/projects/${id}`,
  },

  // Account credentials (status only — never tokens)
  account: {
    credentials: "/api/v1/account/credentials",
    railwayKey: "/api/v1/account/railway-key",
  },

  // Messages & Workflow
  messages: {
    list: (projectId: string) => `/api/v1/projects/${projectId}/messages`,
    create: (projectId: string) => `/api/v1/projects/${projectId}/messages`,
    stream: (projectId: string) => `/api/v1/projects/${projectId}/messages/stream`,
    codeStream: (projectId: string) => `/api/v1/projects/${projectId}/messages/code-stream`,
    deployConfirm: (projectId: string) => `/api/v1/projects/${projectId}/messages/deploy-confirm`,
  },
} as const;
