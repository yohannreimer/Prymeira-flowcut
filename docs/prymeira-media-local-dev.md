# Prymeira Flowcut Local Development

## Local-only Flowcut

Use this when you want localhost without Clerk, Prymeira Account, or R2:

```bash
npm install
npm run dev:local
```

Open `http://127.0.0.1:5182`. The API runs on `http://localhost:4327`, uploaded videos stay under `workspace/`, and `/api/config` reports `directUploadEnabled: false` so the browser uses local multipart upload.

External publishing actions can still require their own credentials, but upload, processing, editing, preview, and export do not require Clerk, Prymeira Account, or R2 in this mode.

## Prymeira Account and Hub Stack

Use this when running Flowcut through the local Prymeira Account and Hub stack.

### 1. Run Prymeira Account

```bash
cd "../Prymeira Account"
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

The Account API must allow the Flowcut app origin in CORS:

```text
http://localhost:5173
```

### 2. Run the Hub

```bash
cd "../Prymeira Account"
VITE_PRODUCT_MEDIA_URL=http://localhost:5173 pnpm dev:hub
```

### 3. Run Flowcut

```bash
npm install
PRYMEIRA_ACCOUNT_API_URL=http://localhost:3001 \
PRYMEIRA_PRODUCT_KEY=media \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me \
VITE_PRYMEIRA_HUB_URL=http://localhost:5175 \
npm run dev
```

`PRYMEIRA_PRODUCT_KEY` defaults to `media`, but setting it explicitly keeps local Hub and API configuration easy to audit.
When the backend denies access, the client redirects to `${VITE_PRYMEIRA_HUB_URL}/acesso-negado`.

### 4. Grant Local Product Access

Grant the Clerk user access to Flowcut from Prymeira Account:

```bash
cd "../Prymeira Account"
pnpm --filter @prymeira/account-api exec tsx src/scripts/grant-product-access.ts --product-key=media --clerk-user-id=user_replace_me --apply
```

### 5. Tenant Storage

When Prymeira auth is enabled, Flowcut stores project data under the authorized workspace:

```text
workspace/workspaces/<workspace_id>/projects/<project_id>
```

Older local projects stored directly under `workspace/<project_id>` are not automatically moved into a tenant workspace. For local testing, copy them into the target workspace folder.
