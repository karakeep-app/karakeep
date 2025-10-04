# Dependency Management with Renovate

## Overview

Renovate is an automated dependency update tool that scans repositories for outdated dependencies and creates pull requests with updates. It supports multiple package managers (npm, Docker, GitHub Actions, etc.) and provides intelligent update strategies based on semantic versioning, adoption metrics, and test results.

**How Renovate Works:**
1. **Scans** repository for package manager files (package.json, Dockerfile, .github/workflows/*.yml)
2. **Checks** for newer versions of dependencies using various data sources
3. **Creates PRs** with dependency updates, grouped by type or package ecosystem
4. **Monitors** test results and can auto-merge safe updates
5. **Provides metrics** like adoption rates, age, and confidence scores for each update

## Configuration Requirements

### Fork Repositories (Current Setup)

Fork repositories require specific configuration to enable Renovate processing:

#### GitHub Repository Settings
- **Issues**: Can be disabled (we use `dependencyDashboard: false`)
- **Actions**: Must be enabled for workflow updates
- **Repository visibility**: Public or private both supported

#### Mend.io Dashboard Settings
- **Repository scan**: Manual trigger available at repository level
- **Status monitoring**: Check at `https://developer.mend.io/github/carsaig/karakeep/-/settings`
- **Branch settings**: Ensure `main` branch is configured correctly

#### renovate.json Configuration Requirements
- `"includeForks": true` - **Required** to enable Renovate on fork repositories
- `"forkProcessing": "enabled"` - **Required** to explicitly enable fork processing
- `"onboarding": false` - **Recommended** to skip onboarding process for forks
- `"requireConfig": "optional"` - **Recommended** to allow running with minimal config
- `"dependencyDashboard": false` - **Required** when Issues are disabled

### Private Repositories

Private repositories have additional requirements:

#### GitHub Repository Settings
- **Issues**: Must be enabled for Dependency Dashboard
- **Actions**: Must be enabled if monitoring workflow dependencies
- **Repository access**: Renovate GitHub App must have access

#### Mend.io Dashboard Settings
- **Organization access**: Ensure Renovate has access to private repositories
- **Token permissions**: Verify GitHub App has necessary permissions

#### renovate.json Configuration Requirements
- `"dependencyDashboard": true` - **Recommended** for private repos with Issues enabled
- Standard configuration options apply (no fork-specific settings needed)

## Configuration File Reference

### Current renovate.json Configuration

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": [
    "config:recommended"
  ],
  "includeForks": true,
  "forkProcessing": "enabled",
  "onboarding": false,
  "requireConfig": "optional",
  "dependencyDashboard": false,
  "timezone": "Europe/Vienna",
  "prConcurrentLimit": 2,
  "prHourlyLimit": 1,
  "packageRules": [
    {
      "description": "Only monitor GitHub Actions workflows",
      "matchManagers": ["github-actions"],
      "enabled": true
    },
    {
      "description": "Disable all other package managers",
      "matchManagers": ["npm", "pnpm", "docker", "dockerfile"],
      "enabled": false
    }
  ],
  "lockFileMaintenance": {
    "enabled": false
  }
}
```

### Configuration Settings Explained

#### Core Settings
- **`$schema`**: Provides IDE validation and autocomplete for configuration
- **`extends`**: Inherits from Renovate's recommended preset configuration
- **`timezone`**: Sets timezone for scheduling (currently Europe/Vienna)

#### Fork-Specific Settings
- **`includeForks: true`**: **Critical** - Enables Renovate to run on fork repositories
- **`forkProcessing: "enabled"`**: **Critical** - Explicitly enables processing of fork repositories
- **`onboarding: false`**: Skips the onboarding PR process (useful for forks)
- **`requireConfig: "optional"`**: Allows Renovate to run with minimal configuration

#### Rate Limiting
- **`prConcurrentLimit: 2`**: Maximum 2 pull requests open simultaneously
- **`prHourlyLimit: 1`**: Maximum 1 pull request created per hour

#### Dashboard Settings
- **`dependencyDashboard: false`**: Disables Dependency Dashboard (required when Issues disabled)

#### Package Rules (Fork-Specific Strategy)
- **GitHub Actions Only**: Only monitors `.github/workflows/*.yml` files for action updates
- **Application Dependencies Disabled**: Ignores package.json, pnpm-lock.yaml, Dockerfile to prevent drift from upstream
- **Lock File Maintenance Disabled**: Prevents automatic lock file updates that could cause conflicts

#### Maintenance
- **`lockFileMaintenance.enabled: false`**: **Disabled** to prevent conflicts with upstream repository

## Upstream Release Monitoring

**Current Status**: Renovate does **NOT** support monitoring upstream repository releases for forks.

### What Renovate Cannot Do
- Monitor karakeep-app/karakeep for new releases
- Create PRs when upstream releases new versions
- Track upstream repository tags or releases
- Notify about upstream changes

### Current Custom Solution
The repository uses a custom GitHub Actions workflow (`.github/workflows/coolify.yml`) that:
- Monitors for new releases from karakeep-app/karakeep
- Updates environment variables via Coolify API
- Triggers deployments with correct version information

### Alternative Solutions
Since Renovate cannot handle upstream release monitoring, consider:
1. **Keep current GitHub Actions solution** - Most reliable for this use case
2. **GitHub Dependabot** - Limited fork support, similar limitations to Renovate
3. **Custom GitHub App** - Would require significant development effort
4. **Third-party services** - Tools like Dependabot alternatives, but most have same fork limitations

**Recommendation**: Continue using the current GitHub Actions + Coolify API solution for upstream release monitoring, as it's specifically designed for this fork's deployment needs.

## Troubleshooting

### Common Issues
1. **"Renovate Status: disabled"** - Usually indicates missing fork configuration (`includeForks`, `forkProcessing`)
2. **No PRs created** - Check Mend.io developer backend for error messages
3. **Rate limiting** - Adjust `prConcurrentLimit` and `prHourlyLimit` if needed
4. **Unwanted dependency updates** - Use `enabled: false` in packageRules to disable specific managers

### Diagnostic Steps
1. Check repository status at `https://developer.mend.io/github/carsaig/karakeep/-/settings`
2. Verify GitHub App permissions in repository settings
3. Trigger manual repository scan from Mend.io dashboard
4. Review job logs in Mend.io developer interface for specific errors

### Fork-Specific Considerations
- **Upstream conflicts**: Avoid updating core dependencies to prevent merge conflicts
- **Workflow updates**: Safe to update as they don't affect application functionality
- **Lock file changes**: Disabled to prevent drift from upstream dependency versions