/**
 * Shared plumbing for the CLI commands: dependency injection (so the whole
 * CLI is testable without a network or a GPU), the catalog cache and the
 * small helpers every command needs.
 */
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  catalogCachePath,
  detectMachine,
  fetchCatalog,
  isCatalogFresh,
  readCatalogCache,
  writeCatalogCache,
  type CatalogModel,
  type DetectOptions,
  type ExecFileLike,
  type FetchCatalogOptions,
  type FetchModelOptions,
  type MachineProfile,
  type ModelTask,
  type OllamaCliInfo,
  type PullResult,
  type SpawnLike
} from '@toolbox/widgets'
import type { ParsedArgs } from './args.js'
import type { Palette } from './render.js'

export interface CliDeps {
  detect?: (options?: DetectOptions) => Promise<MachineProfile>
  fetchCatalog?: (options?: FetchCatalogOptions) => Promise<CatalogModel[]>
  fetchModel?: (repoId: string, options?: FetchModelOptions) => Promise<CatalogModel | null>
  probeOllama?: (execFileImpl: ExecFileLike) => Promise<OllamaCliInfo>
  pull?: (reference: string, options?: { onOutput?: (chunk: string) => void }) => Promise<PullResult>
  runOllama?: (args: string[], options?: { onOutput?: (chunk: string) => void }) => Promise<PullResult>
  execFile?: ExecFileLike
  spawnImpl?: SpawnLike
  write?: (text: string) => void
  env?: Record<string, string | undefined>
  cachePath?: string
  now?: () => number
}

export interface CommandContext {
  deps: CliDeps
  args: ParsedArgs
  palette: Palette
  json: boolean
  write: (text: string) => void
}

/** Where the CLI keeps its cache; overridable for tests and portable installs. */
export function appHome(env: Record<string, string | undefined> = process.env): string {
  return env.TOOLBOX_LLAMAFARM_HOME ?? join(homedir(), '.toolbox-llamafarm')
}

export function cachePathFor(deps: CliDeps): string {
  return deps.cachePath ?? catalogCachePath(appHome(deps.env ?? process.env))
}

/**
 * Load the catalog, preferring a fresh cache. Fetching is slow (one detail
 * request per model), so the cache is what makes the CLI feel instant.
 */
export async function loadCatalog(
  ctx: CommandContext,
  options: { tasks?: ModelTask[]; perTask?: number; refresh?: boolean } = {}
): Promise<{ models: CatalogModel[]; fromCache: boolean }> {
  const path = cachePathFor(ctx.deps)
  const cached = readCatalogCache(path)
  const now = ctx.deps.now?.() ?? Date.now()

  const wanted = options.tasks
  const coversRequested = !wanted || (cached?.models ?? []).some((model) => wanted.includes(model.task))

  if (!options.refresh && cached && coversRequested && isCatalogFresh(cached, undefined, now)) {
    return { models: filterTasks(cached.models, wanted), fromCache: true }
  }

  const fetchImpl = ctx.deps.fetchCatalog ?? fetchCatalog
  const fresh = await fetchImpl({
    ...(wanted ? { tasks: wanted } : {}),
    ...(options.perTask ? { perTask: options.perTask } : {})
  })

  const otherTasks = (cached?.models ?? []).filter((model) => !wanted || !wanted.includes(model.task))
  const merged = [...otherTasks, ...fresh]
  writeCatalogCache(path, merged, now)
  return { models: filterTasks(merged, wanted), fromCache: false }
}

function filterTasks(models: CatalogModel[], tasks?: ModelTask[]): CatalogModel[] {
  if (!tasks || tasks.length === 0) return models
  return models.filter((model) => tasks.includes(model.task))
}

/** Detect the machine with the injected detector. */
export async function detect(ctx: CommandContext): Promise<MachineProfile> {
  const detector = ctx.deps.detect ?? detectMachine
  return detector()
}
