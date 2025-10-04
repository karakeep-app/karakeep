# GitHub Actions + Coolify Deployment Workflow Fix

## Issues Resolved

### Issue 1: Premature Deployment Trigger

**Problem**: Coolify was triggering deployments immediately when the GitHub Actions workflow started, before the ~38 minute Docker build process completed. This caused deployments of outdated or non-existent images.

**Solution**: Split the workflow into two dependent jobs:

*   `build-and-push`: Handles Docker image building and pushing to GHCR
*   `notify-deployment`: Runs only after successful build completion, triggers deployment notification

### Issue 2: Version Tag Not Updating in UI

**Problem**: The Karakeep application UI was not displaying the correct version after deployment.

**Solution**: Added `SERVER_VERSION` environment variable to the Coolify docker-compose configurations to ensure the application receives the correct version information.

## Changes Made

### 1\. GitHub Actions Workflow (`.github/workflows/coolify.yml`)

**Before**: Single job that built and expected Coolify to auto-deploy  
**After**: Two dependent jobs with explicit deployment control

#### Key Changes:

*   Split `build-and-deploy` job into `build-and-push` and `notify-deployment`
*   Added job outputs to pass version and image information between jobs
*   Added `needs: build-and-push` dependency to ensure deployment only happens after successful build
*   Added repository dispatch event to signal deployment readiness
*   Improved error handling with `if: success()` condition

#### New Job Structure:

```
jobs:
  build-and-push:
    # Builds and pushes Docker image
    outputs:
      version: ${{ steps.version.outputs.version }}
      image-digest: ${{ steps.build.outputs.digest }}
      image-tags: ${{ steps.meta.outputs.tags }}
  
  notify-deployment:
    needs: build-and-push
    if: success()
    # Triggers deployment notification
```

### 2\. Coolify Docker Compose Configuration

**Files Updated**:

*   `docker/docker-compose.coolify.yml`
*   `docker/docker-compose.coolify-build.yml`

**Change**: Added `SERVER_VERSION` environment variable:

```
environment:
  SERVER_VERSION: ${SERVER_VERSION:-latest}
```

This ensures the application receives the correct version information for display in the UI.

## Coolify Configuration Requirements

### Option A: Repository Dispatch Events (Recommended)

Configure Coolify to listen for the `coolify-deploy` repository dispatch event instead of workflow start events.

1.  In Coolify, go to your project settings
2.  Change the deployment trigger from "Workflow Run" to "Repository Dispatch"
3.  Set the event type to: `coolify-deploy`

### Option B: Workflow Completion Events

If Coolify supports it, configure it to listen for `workflow_run` completion events instead of start events.

### Option C: Manual Webhook (Alternative)

If repository dispatch doesn't work, you can add a webhook call to the `notify-deployment` job:

```
- name: Trigger Coolify Webhook
  run: |
    curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "${{ needs.build-and-push.outputs.version }}",
        "image_digest": "${{ needs.build-and-push.outputs.image-digest }}",
        "commit_sha": "${{ github.sha }}"
      }'
```

## Environment Variables for Coolify

Ensure these environment variables are set in your Coolify deployment:

*   `SERVER_VERSION`: Set to the version you want to display (e.g., "1.8.0")
*   `NEXTAUTH_SECRET`: Your authentication secret
*   `WEB_IMAGE`: (Optional) Override the default image if needed

## Verification Steps

### 1\. Check Workflow Execution

1.  Push changes to main branch
2.  Verify `build-and-push` job completes successfully (~38 minutes)
3.  Verify `notify-deployment` job runs only after build completion
4.  Check that repository dispatch event is created

### 2\. Check Deployment

1.  Verify Coolify receives the deployment trigger
2.  Check that the new Docker image is pulled
3.  Verify the application starts with the new version

### 3\. Check Version Display

1.  Access the Karakeep application
2.  Navigate to Admin → Server Stats (or check sidebar footer)
3.  Verify the version number matches the expected version
4.  Check that the version is not "NA" or undefined

## Troubleshooting

### Build Job Fails

*   Check Docker build logs for errors
*   Verify GHCR authentication is working
*   Check if upstream karakeep-app/karakeep releases are accessible

### Deployment Not Triggered

*   Verify Coolify is configured to listen for the correct event type
*   Check repository dispatch event was created in GitHub
*   Verify webhook URL and authentication if using webhook approach

### Version Still Not Updating

*   Check Coolify environment variables include `SERVER_VERSION`
*   Verify the Docker image actually contains the version information
*   Check application logs for any configuration errors
*   Ensure Coolify is pulling the new image (not using cached version)

### Force Image Pull

If Coolify is using a cached image, you may need to:

1.  Use a specific version tag instead of `latest`
2.  Configure Coolify to always pull images
3.  Manually restart the deployment after the workflow completes

## Benefits of This Approach

1.  **Eliminates Race Condition**: Deployment only happens after successful build
2.  **Better Error Handling**: Failed builds don't trigger deployments
3.  **Improved Monitoring**: Clear separation between build and deployment phases
4.  **Version Accuracy**: Correct version information displayed in UI
5.  **Deployment Control**: Explicit control over when deployments occur
6.  **Rollback Safety**: Failed builds don't affect running deployments

## Future Improvements

1.  Add deployment verification steps
2.  Implement automatic rollback on deployment failure
3.  Add Slack/Discord notifications for deployment status
4.  Add deployment metrics and monitoring
5.  Consider using specific version tags instead of `latest` for more predictable deployments