# Instagram Reels Publisher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish approved Media Factory vertical clips to Instagram Reels through the Meta Graph API.

**Architecture:** Add a focused Instagram publisher client, wire it into the existing Media Factory publisher orchestration, reuse R2 for public video hosting, and add a local ledger to prevent duplicate Reels.

**Tech Stack:** TypeScript, Vitest, Meta Graph API, Cloudflare R2 S3-compatible storage.

---

### Task 1: Instagram Client

**Files:**
- Create: `src/server/media-factory/instagram-publisher.ts`
- Test: `src/server/media-factory/instagram-publisher.test.ts`

- [ ] Add env parsing for `INSTAGRAM_IG_USER_ID`, `INSTAGRAM_ACCESS_TOKEN`, and optional `INSTAGRAM_GRAPH_API_VERSION`.
- [ ] Add `publishInstagramReel` that creates a Reels container, polls status, and publishes it.
- [ ] Test request URLs, request bodies, status polling, successful publish response, and failed Graph API responses.

### Task 2: Package Orchestration

**Files:**
- Modify: `src/server/media-factory/publisher.ts`
- Test: `src/server/media-factory/publisher.test.ts`

- [ ] Inject Instagram publisher and R2 dependencies into `publishApprovedPackages`.
- [ ] Add Instagram credential and R2 config checks before YouTube credential checks.
- [ ] Read Instagram payloads, upload clip files to R2, call the Instagram publisher, write `Logs/instagram-reels-ledger.json`, and update manifest results.
- [ ] Test successful live publishing, missing credential blocking, missing R2 blocking, and ledger skip.

### Task 3: Configuration Docs

**Files:**
- Modify: `.env.example`
- Modify: `/Users/yohannreimer/Downloads/Locais/MediaFactory/LEIA-ME.txt`

- [ ] Document the new Instagram environment variables.
- [ ] Document that `publishers.instagram = "live"` only works for approved vertical packages with Meta permissions and R2 configured.

### Task 4: Verification

- [ ] Run targeted Vitest tests for Instagram publisher and Media Factory publisher.
- [ ] Run TypeScript check or project build command if targeted tests pass.
