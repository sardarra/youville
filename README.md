# T&C X-ray

Scan a company's privacy policy or terms by pasting text or providing a public HTTP(S) URL. The scan API does not retain submitted text; results are saved in the browser's `tcx.scans` local-storage entry. The explicit `pnpm prescan` command writes a cache result under `data/cache/`.

## Setup

Create `.env.local` and set `GEMINI_API_KEY` and `GEMINI_MODEL` there. Choose a fast Flash-tier model supported by the Google Gen AI SDK; the model ID is read from the environment rather than embedded in the source.

```sh
pnpm install
pnpm dev
```

Run the checks with `pnpm test` and `pnpm exec tsc --noEmit`. To explicitly precompute a scan cache entry for a policy file, use `pnpm prescan <file.txt>`.
