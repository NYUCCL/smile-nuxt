import { useRuntimeConfig } from 'nitropack/runtime'

/**
 * Build a deterministic project ID from its components.
 * Format: owner:repo:branch:mode
 */
export function buildProjectId(owner: string, repo: string, branch: string, mode: string): string {
  return `${owner}:${repo}:${branch}:${mode}`
}

/**
 * Get the current project's owner and repo from runtime config.
 * Used to scope API queries so deployments can only read their own data.
 */
export function getCurrentProjectScope(): { owner: string, repo: string } {
  const config = useRuntimeConfig()
  return {
    owner: config.public.smile?.owner || 'local',
    repo: config.public.smile?.repo || 'experiment',
  }
}

/**
 * Get the current project's full identity from runtime config.
 */
export function getCurrentProjectInfo(): { owner: string, repo: string, branch: string, mode: string } {
  const config = useRuntimeConfig()
  return {
    owner: config.public.smile?.owner || 'local',
    repo: config.public.smile?.repo || 'experiment',
    branch: config.public.smile?.branch || 'main',
    mode: import.meta.dev ? 'test' : 'live',
  }
}
