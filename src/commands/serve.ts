/**
 * `llamafarm serve` — a small local JSON API so other tools (the ops panel,
 * a phone on the LAN, the NAS dashboard) can ask the same questions the CLI
 * answers. Binds to localhost unless another host is asked for.
 */
import { createServer, type Server } from 'node:http'
import { createServer as createTlsServer } from 'node:https'
import { readFileSync } from 'node:fs'
import { scoreModels, sortForDisplay, type FitScenario } from '@toolbox/widgets'
import { flagNumber, flagString } from '../args.js'
import { detect, loadCatalog, type CommandContext } from '../context.js'
import { parseScenario } from './fit.js'
import { parseTasks } from './catalog.js'

export interface ServeOptions {
  host?: string
  port?: number
  tlsCert?: string
  tlsKey?: string
}

export interface ServeHandle {
  port: number
  host: string
  close: () => Promise<void>
}

function sendJson(response: { writeHead: (code: number, headers: Record<string, string>) => void; end: (body: string) => void }, status: number, payload: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(`${JSON.stringify(payload, null, 2)}\n`)
}

export async function startServer(ctx: CommandContext, options: ServeOptions = {}): Promise<ServeHandle> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 3854

  const handler = async (request: { url?: string; method?: string }, response: Parameters<typeof sendJson>[0]): Promise<void> => {
    const url = new URL(request.url ?? '/', `http://${host}:${port}`)
    const path = url.pathname

    try {
      if (path === '/healthz') {
        sendJson(response, 200, { ok: true })
        return
      }
      if (path === '/api/profile') {
        const machine = await detect(ctx)
        sendJson(response, 200, machine)
        return
      }
      if (path === '/api/catalog') {
        const tasks = parseTasks(url.searchParams.get('task') ?? undefined)
        const { models, fromCache } = await loadCatalog(ctx, tasks ? { tasks } : {})
        sendJson(response, 200, { fromCache, count: models.length, models })
        return
      }
      if (path === '/api/fit') {
        const scenario: FitScenario = parseScenario(url.searchParams.get('scenario') ?? undefined)
        const tasks = parseTasks(url.searchParams.get('task') ?? undefined)
        const [machine, { models }] = await Promise.all([detect(ctx), loadCatalog(ctx, tasks ? { tasks } : {})])
        const scored = sortForDisplay(scoreModels({ models, machine, scenario }))
        sendJson(response, 200, { scenario, count: scored.length, models: scored })
        return
      }
      sendJson(response, 404, { error: 'Not found' })
    } catch (cause) {
      sendJson(response, 500, { error: cause instanceof Error ? cause.message : String(cause) })
    }
  }

  let server: Server
  if (options.tlsCert && options.tlsKey) {
    server = createTlsServer(
      { cert: readFileSync(options.tlsCert), key: readFileSync(options.tlsKey) },
      (request, response) => {
        void handler(request as never, response as never)
      }
    )
  } else {
    server = createServer((request, response) => {
      void handler(request, response)
    })
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  const address = server.address()
  const boundPort = typeof address === 'object' && address !== null ? address.port : port

  return {
    port: boundPort,
    host,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
  }
}

export async function serveCommand(ctx: CommandContext): Promise<number> {
  const host = flagString(ctx.args.flags, 'host') ?? '127.0.0.1'
  const port = flagNumber(ctx.args.flags, 'port') ?? 3854
  const tlsCert = flagString(ctx.args.flags, 'tls-cert')
  const tlsKey = flagString(ctx.args.flags, 'tls-key')

  const handle = await startServer(ctx, {
    host,
    port,
    ...(tlsCert ? { tlsCert } : {}),
    ...(tlsKey ? { tlsKey } : {})
  })
  const scheme = tlsCert && tlsKey ? 'https' : 'http'
  ctx.write(`LlamaFarm API on ${scheme}://${handle.host}:${handle.port}\n`)
  ctx.write(`  /api/profile  /api/catalog  /api/fit?scenario=now  /healthz\n`)
  return 0
}
