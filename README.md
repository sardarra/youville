# T&C X-ray

Scan a company's privacy policy or terms by pasting text or providing a public HTTP(S) URL. The scan API does not retain submitted text; results are saved in the browser's `tcx.scans` local-storage entry. The explicit `pnpm prescan` command writes a cache result under `data/cache/`.

## Setup

Copy `.env.example` to `.env.local`, then set `GEMINI_API_KEY`. `GEMINI_MODEL` defaults in the example to a Flash-tier model and can be changed without editing source code.

```sh
pnpm install
pnpm dev
```

Run the checks with `pnpm test` and `pnpm exec tsc --noEmit`. To explicitly precompute a scan cache entry for a policy file, use `pnpm prescan <file.txt>`.
