# Prymeira Media Local Development

Use this when running Media through the local Prymeira Account and Hub stack.

## 1. Run Prymeira Account

```bash
cd "../Prymeira Account"
pnpm install
pnpm prisma:generate
pnpm prisma:migrate
pnpm prisma:seed
pnpm dev
```

The Account API must allow the Media app origin in CORS:

```text
http://localhost:5173
```

## 2. Run the Hub

```bash
cd "../Prymeira Account"
VITE_PRODUCT_MEDIA_URL=http://localhost:5173 pnpm dev:hub
```

## 3. Run Media

```bash
npm install
PRYMEIRA_ACCOUNT_API_URL=http://localhost:3001 \
PRYMEIRA_PRODUCT_KEY=media \
VITE_CLERK_PUBLISHABLE_KEY=pk_test_replace_me \
npm run dev
```

`PRYMEIRA_PRODUCT_KEY` defaults to `media`, but setting it explicitly keeps local Hub and API configuration easy to audit.

## 4. Grant Local Product Access

Grant the Clerk user access to the Media product from Prymeira Account:

```bash
cd "../Prymeira Account"
pnpm --filter @prymeira/account-api exec tsx src/scripts/grant-product-access.ts --product-key=media --clerk-user-id=user_replace_me --apply
```

## 5. Tenant Storage

When Prymeira auth is enabled, Media stores project data under the authorized workspace:

```text
workspace/workspaces/<workspace_id>/projects/<project_id>
```

Older local projects stored directly under `workspace/<project_id>` are not automatically moved into a tenant workspace. For local testing, copy them into the target workspace folder.
