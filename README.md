# Art Lab

A personal algorithmic art lab: a PWA for writing generative sketches, tweaking their
parameters, saving outputs, learning the basics, and getting help from an AI assistant.
Runs entirely on Cloudflare (Workers, D1, R2, Durable Objects, Workers AI).

## How it fits together

| Piece | Where |
|---|---|
| React app (studio, learn, home) | `src/` |
| Sketch sandbox: iframe document, GenArtAPI adapter, noise, loop guard | `src/runtime/` |
| Worker: REST API (Hono), Access auth, agent routing | `worker/index.ts`, `worker/auth.ts` |
| AI assistant (`AIChatAgent` Durable Object) | `worker/agent.ts` |
| Lessons (Markdown; `sketch` code blocks become live examples) | `shared/lessons/` |
| D1 schema | `migrations/` |

Sketches are [GenArtAPI](https://codeberg.org/thi.ng/genart-api) artworks. They run in an
`<iframe sandbox="allow-scripts">` with an opaque origin and a CSP that blocks all network
access, so sketch code (yours, the assistant's, or someday other people's) can't touch the
app's session or API.

## Local development

Needs Node 22+ (Wrangler requirement). On this machine, Node 24 lives in `~/.local/node`:

```bash
export PATH=$HOME/.local/node/bin:$PATH
npm install
npm run db:migrate:local
npm run dev:local   # everything except the assistant, no Cloudflare login needed
npm run dev         # with the assistant: needs `npx wrangler login` first (Workers AI is remote-only)
```

`.dev.vars` sets `DEV_USER`, which skips the Access check locally. Never set it in production.

## First deploy

```bash
npx wrangler login
npx wrangler d1 create art-lab          # paste the database_id into wrangler.jsonc
npx wrangler r2 bucket create art-lab-outputs
npm run db:migrate:remote
```

1. In Zero Trust → Access → Applications, add a self-hosted app for `art.kacperochnik.eu`
   with a policy allowing your email. Copy its **Application Audience (AUD) tag** into
   `ACCESS_AUD` in `wrangler.jsonc`.
2. Optional: create an AI Gateway and put its id in `AI_GATEWAY_ID` (logging, caching, rate limits).
3. `npm run deploy`. The custom domain route creates the DNS record for `art.kacperochnik.eu`.

## Deploying from GitHub

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) builds every pull request and
deploys every push to `main` (or a manual run from the Actions tab). The deploy job creates the
D1 database and R2 bucket on its first run if they don't exist, applies migrations, then runs
`wrangler deploy`. The committed `wrangler.jsonc` keeps its placeholders; the job fills them in.

Repository settings → Secrets and variables → Actions:

| Name | Kind | Value |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | Account API token from the **Edit Cloudflare Workers** template, plus **Account → D1 → Edit**, scoped to your account and the `kacperochnik.eu` zone |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Your account id |
| `ACCESS_AUD` | variable | The Access application's AUD tag (step 1 above) |

The deploy fails early with a clear message if any of these are missing.

The assistant has three tiers: **Fast** (GLM 4.7 Flash, works on the Free plan), **Balanced**
(GLM 5.3 Flash) and **Powerful** (GLM 5.3, about 10× the price of Balanced). The last two need the
Workers Paid plan; if a call to them fails, the assistant falls back to Fast.

## Writing sketches

```js
await $genart.waitForAdapter();
const param = await $genart.setParams({
  count: $genart.params.range({ name: "Count", desc: "How many", min: 10, max: 500, step: 10, default: 100 }),
});
const { ctx, width, height } = lab.canvas();
const rnd = $genart.random.rnd; // seeded: never use Math.random()
```

Helpers: `lab.noise2D`, `lab.noise3D`, `lab.random`, `lab.pick`, `lab.gaussian`, `lab.map`.
Animate with `$genart.setUpdate((timeMs, frame) => { …; return true; })`.

## Known limits (Phase 1)

- The loop guard instruments braced `for`/`while`/`do` loops only; a brace-less infinite loop
  can still hang the sketch frame until the watchdog tears it down.
- High-res export waits ~400 ms after params resolve; very slow sketches may capture early.
- Single user behind Cloudflare Access. Going public needs real auth (Better Auth), quotas and moderation.

## License

MIT. See [LICENSE](LICENSE).
