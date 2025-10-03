# Karakeep Customizations Changelog

## 2025-01-03 - GitHub Actions Workflow Split & Version Display Fix

### Changes Made

#### 1. GitHub Actions Workflow (`.github/workflows/coolify.yml`)
- **CHANGED**: Split single `build-and-deploy` job into two dependent jobs:
  - `build-and-push`: Handles Docker image building and pushing to GHCR
  - `notify-deployment`: Runs after successful build, creates repository dispatch event
- **ADDED**: Job outputs to pass version and image information between jobs
- **ADDED**: Repository dispatch event `coolify-deploy` for deployment signaling
- **IMPROVED**: Error handling with `if: success()` conditions

#### 2. Coolify Docker Compose (`.docker/docker-compose.coolify.yml`)
- **ADDED**: `SERVER_VERSION: ${SERVER_VERSION:-latest}` environment variable

### Issues Addressed

#### Issue 1: Premature Deployment Trigger
**Problem**: Coolify triggered deployments immediately when GitHub Actions workflow started, before the ~38 minute Docker build completed.

**Attempted Solution**: Split workflow into dependent jobs with repository dispatch event.

**Status**: ⚠️ NEEDS VERIFICATION - May not work due to Coolify GitHub App integration limitations.

#### Issue 2: Version Display in UI
**Problem**: Karakeep UI not showing correct version after deployment.

**Solution**: Added SERVER_VERSION environment variable to deployment configuration.

**Status**: ✅ SHOULD RESOLVE - If the issue was missing environment variable.

### Outstanding Questions

1. **Workflow Split Effectiveness**: Will the two-job structure actually prevent premature deployment given Coolify's GitHub App integration constraints?

2. **Version Display Root Cause**: Was the issue:
   - Option A: UI display bug (app was updated, version display was wrong)
   - Option B: App not actually updated (Coolify not pulling latest image)

3. **Coolify Configuration**: Should deployment timing be controlled via:
   - Pre/Post deployment commands
   - Custom build/start commands
   - Watch paths
   - Or keep logic in GitHub Actions workflow

### Next Steps Required

1. Test workflow split effectiveness
2. Verify version display fix
3. Determine if additional Coolify configuration needed
4. Consider alternative solutions if workflow split insufficient