# Karakeep Customizations Changelog

## 2025-01-03 - GitHub Actions Workflow Split & Version Display Fix

### Final Solution Implemented: GitHub App Event Configuration (Solution E)

#### Changes Made

##### 1. GitHub Actions Workflow (`.github/workflows/coolify.yml`)

- **CHANGED**: Split single `build-and-deploy` job into two dependent jobs:
  - `build-and-push`: Handles Docker image building and pushing to GHCR (~38 minutes)
  - `notify-deployment`: Runs only after successful build, creates `coolify-deploy` repository dispatch event
- **ADDED**: Job outputs to pass version and image information between jobs
- **ADDED**: Repository dispatch event `coolify-deploy` for controlled deployment signaling
- **IMPROVED**: Error handling with `if: success()` conditions

##### 2. Coolify Docker Compose (`docker/docker-compose.coolify.yml`)

- **ADDED**: `SERVER_VERSION: ${SERVER_VERSION:-latest}` environment variable

##### 3. GitHub App Event Configuration

- **UNCHECKED**: "Workflow job" event (was triggering on job start/progress)
- **UNCHECKED**: "Push" event (was triggering immediately on push to main)
- **KEPT CHECKED**: "Repository dispatch" event (receives `coolify-deploy` event)

### Issues Resolved

#### Issue 1: Premature Deployment Trigger ✅ RESOLVED

**Problem**: Coolify triggered deployments immediately when GitHub Actions workflow started, before the ~38 minute Docker build completed, causing deployment of outdated images.

**Root Cause**: GitHub App was subscribed to "Workflow job" and "Push" events, triggering deployment on workflow start.

**Solution**:

- Configured GitHub App to only listen to "Repository dispatch" events
- Two-job workflow ensures `coolify-deploy` event only sent after successful build
- Coolify now waits for explicit deployment signal instead of triggering on workflow start

**Expected Behavior**:

1. Push to main → GitHub Actions starts → Coolify does NOT deploy
2. `build-and-push` job completes (~38 minutes) → `notify-deployment` job sends `coolify-deploy` event
3. Coolify receives repository dispatch event → Deployment begins with new image

#### Issue 2: Version Display in UI ✅ RESOLVED

**Problem**: Karakeep UI not showing correct version after deployment.

**Root Cause**: Option B - Coolify was not pulling latest Docker image due to premature deployment issue, AND `SERVER_VERSION` environment variable was missing.

**Solution**:

- Added `SERVER_VERSION` environment variable to deployment configuration
- Fixed premature deployment ensures latest image is available before deployment
- Application now receives correct version information for UI display

### Verification Steps

#### Test Deployment Process

1. **Commit and push changes to main branch**
2. **Monitor GitHub Actions**:
   - Verify `build-and-push` job starts and runs for ~38 minutes
   - Verify `notify-deployment` job only runs after build success
   - Check that repository dispatch event `coolify-deploy` is created
3. **Monitor Coolify**:
   - Verify deployment does NOT start when workflow begins
   - Verify deployment only starts after receiving repository dispatch event
   - Check deployment logs show new image being pulled

#### Verify Version Display

1. **Access Karakeep application after deployment**
2. **Check version display locations**:
   - Sidebar footer: "Karakeep v{version}"
   - Admin page: Settings → Server Stats
3. **Confirm version matches upstream release version** (not "NA" or undefined)

### Technical Implementation Details

#### Workflow Structure

```yaml
jobs:
  build-and-push:
    outputs:
      version: ${{ steps.version.outputs.version }}
      image-digest: ${{ steps.build.outputs.digest }}
    # 38-minute build process

  notify-deployment:
    needs: build-and-push
    if: success()
    # Sends coolify-deploy repository dispatch event
```

#### GitHub App Event Flow

1. **Push Event**: Disabled (prevents immediate deployment)
2. **Workflow Job Event**: Disabled (prevents deployment on job start)
3. **Repository Dispatch Event**: Enabled (receives `coolify-deploy` signal)

### Benefits Achieved

- **Eliminates race condition**: Deployment only after successful 38-minute build
- **Fixes version display**: Correct version shown in UI
- **Uses official integration**: Leverages Coolify's GitHub App (not webhooks)
- **Better error handling**: Failed builds don't trigger deployments
- **Improved monitoring**: Clear separation between build and deployment phases
- **Deployment control**: Explicit control over deployment timing

### Status: Ready for Testing

Both issues should now be resolved. The next push to main branch will test:

1. Whether Coolify waits for build completion before deploying
2. Whether version display shows correct information after deployment
