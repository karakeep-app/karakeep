---
type: "auto"
---

# Title: [Project Title]

Description: This template provides a structured approach for creating a project description. It provides a brief overview of the project's purpose, scope, and goals. It holds details about the project's context, technical specification, task breakdown, deployment strategy, and risk management. It also includes a section on project management, including team roles and responsibilities, communication channels, and project governance.

- if any of the following sections are not required, remove them from the template and stick to the basic structure required for the ongoing project

### Project Overview
**Project Name**: [Project Name]
**Version**: [Current Version]
**Last Updated**: [Date]
**Project Lead**: [Name]
**Status**: [Planning | In Development | Testing | Deployment | Maintenance]

### Project Context
- **Business Objective**: [What business problem does this solve?]
- **Target Users**: [Who will use this software?]
- **Success Metrics**: [How will success be measured?]
- **Timeline**: [Expected completion date and major milestones]

### Epic: [Epic Name]
**Priority**: [High | Medium | Low]
**Dependencies**: [List blocking tasks or external dependencies]

### Technical Specification
- Link to @SPEC.md for technical details.

### Task Breakdown
- Link to @TASKS.md for details.

### Deployment & Operations

#### Environments
- **Development**: [URL, access details from .env.tpl]
- **Production**: [URL, access details from .env.tpl]

#### Deployment Strategy
- **Method**: [Blue-green, rolling, canary]
- **Rollback Plan**: [Procedure for reverting changes]
- **Database Migrations**: [Strategy and rollback procedures]

### Risk Management

#### Technical Risks
| Risk | Impact | Probability | Mitigation Strategy |
|------|---------|-------------|-------------------|
| [Risk description] | High/Med/Low | High/Med/Low | [Mitigation approach] |

#### Contingency Plans
- **Timeline Delays**: [Alternative approaches, scope reduction]
- **Technical Blockers**: [Alternative solutions, expert consultation]

### Communication & Collaboration

#### Development Workflow
- **Version Control**: [Git workflow, branching strategy]
- **Code Review Process**: [PR requirements, approval workflow]

### Post-Launch Activities

#### Maintenance Plan
- [ ] Bug fix prioritization process
- [ ] Feature enhancement roadmap
- [ ] Performance monitoring and optimization
- [ ] Security updates and patches

### Last Updated
- Include the most recent update date and a brief description of the changes made. Link to the @CHANGELOG.md file for more details.
