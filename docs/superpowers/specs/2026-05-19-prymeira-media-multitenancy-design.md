# Prymeira Media Multitenancy Design

Date: 2026-05-19

## Goal

Bring the current MediaFactory/Flowcut app into the Prymeira Account ecosystem as the `media` product.

The app should:

- authenticate users with Clerk;
- authorize access through Prymeira Account using the shared `@prymeira/auth` package;
- appear and open correctly from the Prymeira Hub;
- isolate projects, uploads, renders, jobs, and SaaS upload sessions by Prymeira workspace;
- preserve the existing local editor workflow while adding tenant boundaries.

## Product Identity

Use the existing Prymeira Account product key:

```text
media
```

This product already exists in `../Prymeira Account/apps/account-api/prisma/seed.ts` and is already represented in the Hub as "Media AI". Interface labels can be renamed later without changing the authorization contract.

## Architecture

### Prymeira Account

Prymeira Account remains the source of truth for customer, workspace, product entitlement, product seat, plan, and limits.

The current app should not duplicate entitlement logic. It should depend on the local package:

```json
"@prymeira/auth": "file:../Prymeira Account/packages/auth"
```

Server routes use `requireProductAccess("media", ...)` or an app wrapper around it. The returned access decision becomes the tenant context:

- `workspace_id`
- `workspace_role`
- `product_role`
- `plan`
- `limits`

### Hub

The Hub already resolves product URLs from Account product metadata and optional `VITE_PRODUCT_<KEY>_URL` overrides.

For local development, use:

```text
VITE_PRODUCT_MEDIA_URL=http://localhost:5173
```

In production, the Account seed already points `media` to:

```text
https://media.prymeiradigital.com.br
```

### Media App Frontend

The React app should be wrapped in Clerk using `VITE_CLERK_PUBLISHABLE_KEY`.

Signed-out users see Clerk sign-in/sign-up. Signed-in users enter the editor. Every API request includes:

```http
Authorization: Bearer <clerk_session_token>
```

The API client should centralize token injection so existing feature calls do not each hand-roll auth headers.

### Media App Backend

The backend should create a Prymeira tenant context for protected routes by:

1. extracting the bearer token;
2. calling `@prymeira/auth` against `PRYMEIRA_ACCOUNT_API_URL`;
3. requiring product access for `PRYMEIRA_PRODUCT_KEY`, defaulting to `media`;
4. rejecting missing tokens with 401;
5. rejecting denied entitlements with 403;
6. returning Account API failures as 502.

The existing manual `src/server/media-factory-saas/access.ts` behavior should be replaced or refactored to use `@prymeira/auth`, keeping the local error response shape stable for tests and clients.

## Tenant Isolation

The main project workspace should move from a global project root:

```text
<AI_EDITOR_WORKSPACE>/<project_id>
```

to a tenant-scoped root:

```text
<AI_EDITOR_WORKSPACE>/workspaces/<workspace_id>/projects/<project_id>
```

All project operations must resolve the workspace root from the authorized tenant context before reading or writing files.

Protected surfaces include:

- project list;
- video upload;
- project restore;
- deletion;
- music upload;
- captions;
- motion planning;
- YouTube package generation;
- YouTube publishing;
- media asset serving for tenant project files.

The existing SaaS upload storage keys already include `workspace_id` and should continue using that convention.

## Routing Model

Keep existing API paths for the UI:

```text
/api/projects/*
/api/mediafactory/*
```

Internally, route handlers receive a tenant-aware workspace root. This avoids forcing a frontend URL migration while still enforcing backend isolation.

Rendered media URLs can remain:

```text
/media/<project_id>/<filename>
```

but the media route must require auth and resolve the file under the caller's tenant workspace. If unauthenticated video playback becomes awkward in the browser, use signed short-lived media URLs or a token-aware fetch/blob player in a follow-up.

## Configuration

Add or document these environment variables:

```text
VITE_CLERK_PUBLISHABLE_KEY=pk_...
PRYMEIRA_ACCOUNT_API_URL=http://localhost:3001
PRYMEIRA_PRODUCT_KEY=media
AI_EDITOR_WORKSPACE=workspace
```

For local Hub integration:

```text
VITE_PRODUCT_MEDIA_URL=http://localhost:5173
```

Prymeira Account CORS must include the Media app origin, for example:

```text
http://localhost:5173
```

## Error Handling

The app should show clear states for:

- signed out;
- missing Account API configuration;
- missing product access;
- suspended or inactive workspace;
- plan limit exceeded;
- Account API unavailable.

Backend responses should keep structured errors where possible:

```json
{
  "error": {
    "code": "product_access_denied",
    "message": "Access denied for media: no_entitlement."
  }
}
```

## Testing

Add focused tests for:

- backend auth wrapper calls `@prymeira/auth` with product key `media`;
- missing token returns 401;
- denied product access returns 403;
- Account API failure returns 502;
- project list only reads the authorized workspace path;
- project creation writes under `workspaces/<workspace_id>/projects`;
- project media serving rejects cross-tenant access;
- frontend API client attaches the Clerk token;
- signed-out frontend renders the Clerk access gate.

Existing project/job tests should continue to support injecting a test workspace root and mocked auth context.

## Migration Notes

Existing local projects in the old global workspace will not automatically appear under tenants. For development, they can be copied into:

```text
workspace/workspaces/<workspace_id>/projects/
```

A production migration can be added later once there is real tenant data to preserve.

## Confirmed Decisions

The approved product key is `media`.

Visual naming remains flexible. The Hub can continue showing "Media AI" for now, and the app interface can be renamed later without changing authorization or tenancy behavior.
