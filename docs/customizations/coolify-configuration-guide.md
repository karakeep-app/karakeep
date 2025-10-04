# Coolify Configuration Guide for Karakeep Deployment

## Quick Setup Checklist

### 1\. GitHub Repository Settings

*   ✅ Workflow file updated (`.github/workflows/coolify.yml`)
*   ✅ Docker compose files updated with `SERVER_VERSION`
*   ✅ Repository dispatch events enabled

### 2\. Coolify Platform Configuration

#### Option A: Repository Dispatch (Recommended)

1.  Go to your Karakeep project in Coolify
2.  Navigate to **Settings** → **Build & Deploy**
3.  Change **Deployment Trigger** from "Workflow Run" to "Repository Dispatch"
4.  Set **Event Type** to: `coolify-deploy`
5.  Save configuration

#### Option B: Workflow Completion Events

1.  Go to **Settings** → **Build & Deploy**
2.  Set **Deployment Trigger** to "Workflow Run"
3.  Set **Event** to "Completed" (not "Started")
4.  Set **Conclusion** to "Success"
5.  Save configuration

### 3\. Environment Variables in Coolify

Ensure these are set in your Coolify deployment environment:

```
# Required
NEXTAUTH_SECRET=your-secret-here
SERVER_VERSION=1.8.0  # Or use ${SERVER_VERSION:-latest}

# Optional (if overriding defaults)
WEB_IMAGE=ghcr.io/carsaig/karakeep:latest
DATA_DIR=/data
MEILI_ADDR=http://meilisearch:7700
BROWSER_WEB_URL=http://chrome:9222
```

### 4\. Docker Image Configuration

*   **Image**: `ghcr.io/carsaig/karakeep:latest`
*   **Pull Policy**: Always (to ensure latest image is used)
*   **Platform**: `linux/arm64`

## Testing the Setup

### 1\. Trigger a Deployment

```
# Push a change to main branch
git add .
git commit -m "Test deployment workflow"
git push origin main
```

### 2\. Monitor the Process

**GitHub Actions**: Watch the workflow progress

*   `build-and-push` job should complete (~38 minutes)
*   `notify-deployment` job should run after build success

**Coolify**: Check deployment logs

*   Should start only after GitHub workflow completion
*   Should pull the new Docker image
*   Should restart services with new version

### 3\. Verify Version Display

1.  Access your Karakeep instance
2.  Check version in:
    *   **Sidebar footer**: "Karakeep v1.8.0"
    *   **Admin page**: Settings → Server Stats
3.  Version should match the upstream release version

## Troubleshooting Common Issues

### Issue: Coolify Still Deploys Too Early

**Symptoms**: Deployment starts immediately when workflow begins  
**Solutions**:

1.  Double-check Coolify trigger configuration
2.  Ensure you're using "Repository Dispatch" not "Workflow Run Started"
3.  Verify the event type is exactly `coolify-deploy`

### Issue: Version Shows "NA" or Undefined

**Symptoms**: UI shows no version or "NA"  
**Solutions**:

1.  Check `SERVER_VERSION` environment variable is set in Coolify
2.  Verify the Docker image was built with the correct build args
3.  Check application logs for configuration errors

### Issue: Deployment Not Triggered at All

**Symptoms**: Build completes but Coolify doesn't deploy  
**Solutions**:

1.  Check repository dispatch event was created in GitHub
2.  Verify Coolify has proper GitHub App permissions
3.  Check Coolify logs for webhook/event processing errors

### Issue: Old Image Still Running

**Symptoms**: Deployment happens but version doesn't change  
**Solutions**:

1.  Set Coolify to "Always Pull" images
2.  Use specific version tags instead of `latest`
3.  Manually restart deployment after workflow completes

## Advanced Configuration

### Using Specific Version Tags

Instead of `latest`, you can use specific version tags:

```
# In docker-compose.coolify.yml
services:
  web:
    image: ${WEB_IMAGE:-ghcr.io/carsaig/karakeep:${SERVER_VERSION:-latest}}
```

### Adding Webhook Notifications

Add to the `notify-deployment` job:

```
- name: Notify Coolify via Webhook
  run: |
    curl -X POST "${{ secrets.COOLIFY_WEBHOOK_URL }}" \
      -H "Authorization: Bearer ${{ secrets.COOLIFY_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{
        "version": "${{ needs.build-and-push.outputs.version }}",
        "commit": "${{ github.sha }}"
      }'
```

### Health Check Configuration

Ensure proper health checks in docker-compose:

```
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 10s
  retries: 3
  start_period: 60s
```

## Monitoring and Alerts

### GitHub Actions Notifications

Add Slack/Discord notifications to workflow:

```
- name: Notify on Success
  if: success()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -d "payload={\"text\":\"✅ Karakeep v${{ needs.build-and-push.outputs.version }} deployed successfully\"}"

- name: Notify on Failure
  if: failure()
  run: |
    curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
      -d "payload={\"text\":\"❌ Karakeep deployment failed - check GitHub Actions\"}"
```

### Coolify Monitoring

1.  Enable Coolify notifications for deployment events
2.  Set up uptime monitoring for your Karakeep instance
3.  Configure log aggregation for troubleshooting

## Security Considerations

1.  **Secrets Management**: Store sensitive values in GitHub Secrets or Coolify environment variables
2.  **Image Security**: Regularly update base images and dependencies
3.  **Access Control**: Limit GitHub App permissions to minimum required
4.  **Network Security**: Use proper firewall rules and network isolation

## Rollback Procedure

If deployment fails:

1.  **Immediate**: Rollback in Coolify to previous working deployment
2.  **Investigation**: Check GitHub Actions logs and Coolify deployment logs
3.  **Fix**: Address the issue in code and redeploy
4.  **Prevention**: Add tests to catch similar issues in the future