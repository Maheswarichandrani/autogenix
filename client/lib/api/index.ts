/**
 * lib/api/index.ts
 * 
 * Centralized API exports - single import point
 */

export * from "./fetch";
export * from "./config";
export * from "./users";
export * from "./projects";
export * from "./messages";
export * from "./account";

/**
 * Usage examples:
 * 
 * import { usersAPI, projectsAPI, messagesAPI } from "@/lib/api";
 * 
 * const response = await usersAPI.getCurrentUser();
 * const project = await projectsAPI.getById(id);
 * const messages = await messagesAPI.list(projectId);
 */
