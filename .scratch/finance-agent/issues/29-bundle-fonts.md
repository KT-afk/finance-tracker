# 29: Builds must not depend on downloading fonts

**Phase:** B

**Priority:** P1

**What to build:** On 2026-10-27 the production deploy of pull request #31 failed: Vercel's build could not download IBM Plex from Google Fonts (`next/font/google`). The same commit built fine elsewhere, so the failure was the download, not the code. Bundle the fonts in the repo so a build never needs Google.

**Blocked by:** None

**Status:** resolved

- [x] IBM Plex Sans (variable, 400–600) and IBM Plex Mono (400, 500), Latin, are in `app/fonts` with their OFL licence
- [x] `app/layout.tsx` loads them with `next/font/local`, keeping the `--font-sans` and `--font-mono` names
- [x] With the network cut off, the old code fails to build and the new code builds

## Comments

Resolved (2026-10-27). Proof: both versions built with `HTTPS_PROXY` pointing nowhere. Old: "Failed to fetch `IBM Plex Sans` from Google Fonts", exit 1. New: "Compiled successfully". The built CSS declares the same weights from the bundled files.
