/**
 * User types matching the backend SQLAlchemy User model
 */

export type DeveloperLevel = "beginner" | "intermediate" | "advanced" | "founder";

export type PreferredStack = "fastapi" | "flask" | "django" | "express" | "springboot" | "gin";

export type SubscriptionTier = "free" | "pro" | "enterprise";

export interface User {
  id: string; // UUID
  github_id: string;
  email: string;
  username?: string;
  
  // User preferences
  preferred_stack?: string | null; // e.g., "fastapi", "express". Older accounts may hold other values
  preferred_language?: string | null; // Set by the server from the stack, e.g., "python", "java"
  developer_level: DeveloperLevel;
  
  // Onboarding
  onboarding_completed: number; // 0 = false, 1 = true
  
  // Subscription
  subscription_tier: SubscriptionTier;
  monthly_builds_used: number;
  monthly_builds_limit: number;
  
  // Timestamps
  created_at: string; // ISO date string
  last_active_at: string; // ISO date string
}



/**
 * Onboarding form data
 */
export interface UpdateUserData {
  preferred_stack: PreferredStack;
  developer_level: DeveloperLevel;
}


export interface CreateUserData {
    github_token: string;
}
