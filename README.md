# LlamaFarm CLI

**What local models fit this machine — and how to run them.**

LlamaFarm reads the live [HuggingFace](https://huggingface.co) catalog, measures every
model by its real file size, and compares that against the RAM and VRAM this computer
actually has. Two questions, two answers:

- **total** — what could this machine run if it were idle?
- **now** — what runs with the memory that is free right now (93% of it, so the desktop
  stays responsive).

Results are grouped per skill set — text generation, text to image, text to speech,
image to text, image to image, text to video, any to any, speech to text — and inside
each group the lightest model comes first.

Part of the Toolbox family:

| App | Repo |
| --- | --- |
| Toolbox (desktop) | [`toolbox-desktop`](https://github.com/28121978444/toolbox-desktop) |
| NAS companion | [`toolbox-nas`](https://github.com/28121978444/toolbox-nas) |
| MCP server + panel | [`toolbox-mcp`](https://github.com/28121978444/toolbox-mcp) |
| Shared widget core | [`toolbox-widgets`](https://github.com/28121978444/toolbox-widgets) |

## Commands

```bash
llamafarm status                  # CPU, RAM, GPU, local runtimes
llamafarm catalog                 # the live catalog with real file sizes
llamafarm fit                     # what runs here, grouped per skill set
llamafarm fit --scenario total    # what could run when the machine is idle
llamafarm explain owner/repo      # one model: size, fit and the commands to run it
llamafarm install owner/repo      # pull a GGUF into the local Ollama runtime
llamafarm serve                   # local JSON API for other tools
```

Useful flags: `--task text-to-image`, `--top 5`, `--per-task 40`, `--refresh`,
`--quant Q8_0`, `--offload 24`, `--json`, `--no-color`.

## Install

Requires Node.js 22+.

```bash
npm install
npm run build
npm link          # optional: puts `llamafarm` on your PATH
```

The shared core (`@toolbox/widgets`) is a sibling checkout — clone
`toolbox-widgets` next to this folder, or point the dependency at your copy.

## The Ollama path

Ollama serves any GGUF straight from the Hub, so no conversion is needed:

```bash
ollama pull hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M
ollama run  hf.co/bartowski/Llama-3.2-3B-Instruct-GGUF:Q4_K_M
```

`llamafarm install` runs exactly that, and `llamafarm install <repo> --offload 24`
writes a Modelffile that pins how many layers stay on the GPU.

## Local API

`llamafarm serve` exposes the same answers over HTTP on `127.0.0.1:3854`:

| Endpoint | What it returns |
| --- | --- |
| `/api/profile` | The machine profile (RAM, cores, GPUs, Ollama) |
| `/api/catalog` | The catalog (`?task=text-to-image` to narrow it) |
| `/api/fit` | Scored models (`?scenario=now\|total`) |
| `/healthz` | Liveness |

Bind elsewhere with `--host`, and serve over HTTPS with `--tls-cert` / `--tls-key`.

## Development

```bash
npm test           # build + node:test suite
npm run typecheck
```

## License

MIT — see [LICENSE](LICENSE).
