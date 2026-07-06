# Instagram Reels Publisher Design

## Goal

Enable Media Factory to publish approved vertical clips to Instagram Reels automatically when `publishers.instagram` is set to `live`.

## Architecture

The publisher will follow the existing YouTube Shorts and X patterns: a focused platform client, package-level orchestration inside `publisher.ts`, a local ledger to prevent duplicate posts, and manifest `publishResults` updates after successful publication.

Instagram requires a publicly reachable media URL, so each clip will be uploaded to the existing R2 storage before creating the Instagram media container. The Instagram client will then call the Graph API container endpoint, poll container status, and publish the container.

## Configuration

Required environment variables:

- `INSTAGRAM_IG_USER_ID`
- `INSTAGRAM_ACCESS_TOKEN`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ENDPOINT`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

Optional:

- `INSTAGRAM_GRAPH_API_VERSION`, defaulting to `v24.0`

## Data Flow

1. Read approved vertical package manifest.
2. For each `instagram-reels-payload.json`, skip if already present in `Logs/instagram-reels-ledger.json`.
3. Read caption, hashtags, and video path from the payload.
4. Upload the local clip to R2 using a stable Instagram object key.
5. Create an Instagram Reels container with `media_type=REELS`, `video_url`, and caption.
6. Poll the container until `status_code=FINISHED`.
7. Publish using `media_publish`.
8. Record the result in the ledger and manifest.

## Error Handling

Missing Instagram credentials block only the Instagram item. Missing R2 config blocks Instagram because Meta needs a public `video_url`. Graph API failures should include the response status and body. Container polling should fail after a bounded number of attempts instead of hanging.

## Testing

Tests cover env parsing, API request sequencing, invalid payload handling, successful package publishing, ledger skip behavior, and blocking when Instagram or R2 configuration is absent.
