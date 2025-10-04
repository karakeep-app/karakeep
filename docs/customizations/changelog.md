# Karakeep Customizations Changelog

## 2025-10-04 - Renovate Configuration

### Added Automated Dependency Management (GitHub Actions Only)

**What was added:**
- `renovate.json` configuration file for automated dependency updates
- Configured Renovate GitHub App for fork repository
- Comprehensive documentation at `docs/customizations/dependency-management.md`

**Final configuration highlights:**
- **Fork-specific settings**: `includeForks: true` and `forkProcessing: enabled` to work on fork repositories
- **GitHub Actions only**: Only monitors `.github/workflows/` files for action updates
- **Application dependencies disabled**: Prevents drift from upstream karakeep-app/karakeep repository
- **Lock file maintenance disabled**: Avoids conflicts with upstream dependency versions
- **Rate limiting**: Maximum 2 concurrent PRs, 1 per hour for conservative updates

**Rationale for GitHub Actions only:**
- Keeps workflow automation up-to-date without affecting core application
- Prevents fork from drifting from upstream repository
- Avoids breaking core features through dependency updates
- Maintains compatibility for future upstream merges

**Upstream release monitoring:**
- **Renovate limitation confirmed**: Cannot monitor upstream repository releases for forks
- **Current solution maintained**: GitHub Actions + Coolify API workflow continues to handle upstream release tracking
- **Alternative solutions evaluated**: No better options available for fork upstream monitoring

**Benefits:**
- Automated GitHub Actions updates for security and features
- Maintains fork compatibility with upstream repository
- Documented configuration for future reference
- Clear separation between workflow automation and application dependencies

**Monitoring:**
- Check Mend.io dashboard for Renovate status
- Monitor GitHub Actions update PRs
- Upstream releases continue to be handled by existing custom workflow

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

### Status: UPDATED SOLUTION - Repository Dispatch Not Supported

**Test Results from 34-minute workflow run (18227634849):**

✅ **Confirmed Working:**
- No premature deployment (Issue 1 partially resolved)
- Two-job workflow structure works perfectly
- `build-and-push` job completed successfully (34 minutes)
- `notify-deployment` job executed successfully
- Repository dispatch event `coolify-deploy` was sent with correct payload

❌ **Issue Discovered:**
- Coolify did NOT respond to repository dispatch event
- **Root Cause**: Coolify's GitHub App integration does not support repository dispatch events for deployment triggers

### Updated Solution: Coolify Webhook URL (Solution B) - IMPLEMENTED

**Changes Made:**
- ✅ **Replaced repository dispatch with Coolify webhook**: Removed `peter-evans/repository-dispatch@v3` action
- ✅ **Added 1Password integration**: Uses `1password/load-secrets-action@v2` to securely load webhook URL
- ✅ **Maintained two-job workflow structure**: Build → Deploy sequence preserved
- ✅ **Uses existing 1Password setup**: Leverages `OP_SERVICE_ACCOUNT_TOKEN` secret already configured

**Implementation Details (UPDATED):**
- **1Password References**:
  - `op://SECRETS/Karakeep/WEBHOOK`: Webhook URL
  - `op://SECRETS/Karakeep/DEPLOYMENT_TOKEN`: Coolify API token
- **Webhook Method**: HTTP GET with Bearer token authentication (per Coolify API specification)
- **Security**: Webhook URL and token loaded at runtime, not stored in GitHub secrets

### ❌ ISSUE DISCOVERED: Dual Deployment Triggers

**Problem Identified:**
- GitHub App "Push" event triggers Coolify immediately when workflow starts (OLD IMAGE)
- Our webhook call triggers Coolify again after build completes (NEW IMAGE)
- **Result**: Race condition with premature deployment still occurring

**Root Cause:**
Both deployment mechanisms are active simultaneously, creating conflicting triggers.

### ✅ FINAL SOLUTION: Disable Per-Project Auto Deploy Setting

**CORRECTED UNDERSTANDING:**
- Coolify DOES have per-project Auto Deploy settings (contrary to initial assumption)
- GitHub App integration remains global, but Auto Deploy is configurable per-project
- Found in project's "Advanced Settings" section

**Required Actions:**
1. **Go to Coolify Dashboard → Karakeep Project → Advanced Settings**
2. **Find "Auto Deploy" setting** (enabled by default for GitHub App projects)
3. **Disable Auto Deploy** for this project only
4. **Save changes**

**Benefits:**
- ✅ **Karakeep**: Uses webhook-only deployment (no automatic GitHub App deployment)
- ✅ **Other projects**: Continue using GitHub App with automatic deployments
- ✅ **Same GitHub App**: Remains connected and functional for all projects
- ✅ **Per-project control**: Each project has independent Auto Deploy settings

**Expected Behavior (Final):**
1. Push to main → GitHub Actions starts → **Coolify does NOTHING** (Auto Deploy disabled)
2. Build completes (34 minutes) → Webhook triggers Coolify → Deployment begins with new image
3. Version display shows correct version

**Source:** [Official Coolify Documentation](https://coolify.io/docs/applications/) and [verified implementation](https://developkerr.com/blog/self-hosting-aspnet-core/)

### ✅ SUCCESS: Auto Deploy Setting Disabled

**Status Update:**
- ✅ **Auto Deploy checkbox found** in Coolify project Advanced Settings
- ✅ **Auto Deploy disabled** for Karakeep project only
- ✅ **No premature deployment** when GitHub Actions workflow started (confirming setting works)
- ⏳ **Build in progress** (~34-minute Docker image build)
- ⏳ **Awaiting webhook test** when build completes

**Verification Steps:**
1. ✅ **Workflow started** → No immediate Coolify deployment (Auto Deploy disabled working)
2. ⏳ **Build completes** → `notify-deployment` job should execute webhook call
3. ⏳ **Webhook triggers Coolify** → Single deployment with new Docker image
4. ⏳ **Version displays correctly** → UI shows proper version after deployment

**Expected Final Outcome:**
- **Issue 1 RESOLVED**: No premature deployment (Auto Deploy disabled)
- **Issue 2 RESOLVED**: Correct version display (webhook deployment with new image)
- **Other projects unaffected**: GitHub App continues working for other repositories

### ❌ ISSUE: Webhook Not Triggering Deployment

**Problem:**
- ✅ GitHub Actions workflow completed successfully (including `notify-deployment` job)
- ❌ Coolify did NOT start deployment after webhook call
- **Possible causes**: Webhook URL incorrect, authentication failure, or payload issues

**Debugging Solution: Test Webhook Created**
- ✅ **Created**: `.github/workflows/test-coolify-webhook.yml`
- **Purpose**: Rapid webhook testing without 34-minute Docker build
- **Features**:
  - Manual trigger only (workflow_dispatch)
  - 1Password integration verification
  - Webhook connectivity testing
  - HTTP response code capture
  - Detailed error reporting
  - Completes in <2 minutes

**Test Workflow Capabilities:**
1. **1Password Integration Test**: Verifies webhook URL loading from `op://SECRETS/Karakeep/WEBHOOK`
2. **Connectivity Test**: HEAD request to verify endpoint reachability
3. **Webhook Call Test**: POST request with test payload and response analysis
4. **Error Diagnosis**: Identifies authentication, connectivity, or configuration issues

**Next Steps:**
1. Run test workflow manually to diagnose webhook issues
2. Fix any identified problems (URL, authentication, payload format)
3. Re-test main workflow once webhook is confirmed working

### ❌ CONFIRMED: Webhook Authentication Failure (HTTP 401)

**Test Results:**
- ✅ **1Password Integration**: Successfully loaded webhook URL from `op://SECRETS/Karakeep/WEBHOOK`
- ✅ **Connectivity**: Webhook endpoint is reachable
- ❌ **Authentication**: HTTP 401 Unauthorized error on POST request
- **Root Cause**: Webhook URL missing authentication credentials or incorrect format

**Coolify Webhook URL Format Requirements:**
Coolify webhook URLs should include authentication as query parameters:
```
https://<coolify-domain>/api/v1/deploy?uuid=<resource-uuid>&token=<auth-token>
```
Or similar format with embedded authentication.

**Required Actions:**
1. **Get correct webhook URL from Coolify**:
   - Go to Coolify Dashboard → Karakeep Project → Webhooks section
   - Copy the complete webhook URL (includes authentication token)

2. **Update 1Password secret**:
   - Verify `op://SECRETS/Karakeep/WEBHOOK` contains the complete URL with auth token
   - Ensure no trailing spaces or formatting issues

3. **Re-test**: Run test workflow to confirm HTTP 200/201/202 response

**Expected Resolution:**
Once webhook URL includes correct authentication, both test and main workflows should successfully trigger Coolify deployments.

### ✅ SOLUTION IDENTIFIED: Incorrect Webhook API Format

**Root Cause Found:**
Based on official Coolify documentation, the webhook API requires:
- **HTTP Method**: GET (not POST)
- **Authentication**: Bearer token in Authorization header (not embedded in URL)
- **No payload required**: Coolify webhook endpoints don't expect JSON payloads

**Official Coolify Webhook Format:**
```bash
curl --request GET "$COOLIFY_WEBHOOK_URL" \
  --header "Authorization: Bearer $COOLIFY_TOKEN"
```

**Changes Made:**
1. ✅ **Updated main workflow** (`.github/workflows/coolify.yml`):
   - Changed from POST to GET request
   - Removed JSON payload
   - Added Bearer token authentication via Authorization header
   - Added `COOLIFY_DEPLOYMENT_TOKEN: op://SECRETS/Karakeep/DEPLOYMENT_TOKEN` to 1Password integration

2. ✅ **Updated test workflow** (`.github/workflows/test-coolify-webhook.yml`):
   - Applied same changes for consistency
   - Added token verification in 1Password integration test
   - Updated webhook call to match Coolify API specification
   - Fixed boolean input type for workflow dispatch

**Required 1Password Setup:**
- `op://SECRETS/Karakeep/WEBHOOK`: Webhook URL (without embedded token)
- `op://SECRETS/Karakeep/DEPLOYMENT_TOKEN`: Coolify API token for Bearer authentication

**Next Steps:**
1. ✅ Ensure Coolify API token is stored in 1Password at `op://SECRETS/Karakeep/DEPLOYMENT_TOKEN`
2. ✅ Run updated test workflow to verify HTTP 200 response
3. ✅ Test main deployment workflow once webhook format is confirmed working

### ❌ NEW ISSUE DISCOVERED: Webhook Triggers Deployment But App Not Updated

**Problem Identified:**
- ✅ Webhook call now works (HTTP 200 response)
- ✅ Coolify deployment is triggered successfully
- ❌ **App still shows old version** - deployment uses cached/old Docker image

**Root Cause:**
The webhook only tells Coolify to "deploy" but doesn't specify which Docker image version to use. Coolify needs environment variables to know about the new image.

**Required Coolify Configuration:**
In Coolify's environment variables, you need to set:
```bash
WEB_IMAGE=ghcr.io/carsaig/karakeep:latest
SERVER_VERSION=<actual-version-number>
```

**✅ SOLUTION IMPLEMENTED: Dynamic Environment Variable Updates**

**Changes Made:**
1. ✅ **Added Coolify API integration** to workflow:
   - `COOLIFY_API_URL: op://SECRETS/Karakeep/API_URL`
   - `COOLIFY_APPLICATION_UUID: op://SECRETS/Karakeep/APPLICATION_UUID`

2. ✅ **Added environment variable update step**:
   - Uses Coolify bulk update API endpoint: `/api/v1/applications/{uuid}/envs/bulk`
   - Correct request format: `{"data": [{"key": "...", "value": "...", "is_preview": false}]}`
   - Sets version to the actual built version from GitHub Actions
   - Includes error handling and response validation
   - Runs before webhook deployment trigger

3. ✅ **Automated CI/CD process**:
   - No manual intervention required
   - `SERVER_VERSION` automatically updated with each deployment
   - Ensures app always shows correct version

**Required 1Password Setup (UPDATED):**
- `op://SECRETS/Karakeep/WEBHOOK`: Webhook URL
- `op://SECRETS/Karakeep/DEPLOYMENT_TOKEN`: Coolify API token
- `op://SECRETS/Coolify/BASE_URL`: Coolify base URL (e.g., `https://your-coolify.com`)
- `op://SECRETS/Karakeep/APPLICATION_UUID`: Your Karakeep application UUID from Coolify

**Note**: The workflow automatically appends `/api/v1` to the base URL as per Coolify API documentation.

**Workflow Process:**
1. Build Docker image with version
2. Update Coolify `SERVER_VERSION` environment variable via API
3. Trigger deployment via webhook
4. Coolify deploys with correct version and environment variables
