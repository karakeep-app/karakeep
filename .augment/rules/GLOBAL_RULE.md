---
type: "always_apply"
---

# Assistant Guidelines

- These rules are absolutely imperative to adhere to. Comply with them precisely as they are outlined.
- If you need to break rules - ask me for permission first and wait for my consent
- Always be aware of the rules available to you and the context they might apply to.
- Rules are named and structured according to corresponding context and requirement. Pick the relevant rules as needed to help you enhance workflow and productivity.
- The following subsequent rules exist:
  - @UNIFIED_MEMORY.md
  - @CODE_ANALYSIS.md
  - @CODING_STYLE.md
  - @DEVOPS.md
  - @PROJECT_RULES.md
- use sequential thinking MCP tool and zen mcp tool to work out problems and solve them with the help of desktop-commander mcp tool.
- use available mcp servers for extended search and problem solving, if required.
- You MUST use mcp servers for memory management as outlined in the @MEMORY.md file.
- Always use task-master ai mcp tool for structuring tasks, projects or workflows.
- before writing any code, solving any issue or implementing a feature, you must first understand the problem and its requirements and if in doubt, consult the rules first, mcp tools as external helping resource second and the user as third helping resource.

## Core Behavior Guidelines

- Respond only to explicit requests. Do not add files, code, tests, or comments unless asked.
- Follow instructions precisely. No assumptions or speculative additions.
- Use provided context accurately.
- Avoid extra output. No debugging logs or test harnesses unless requested.
- Produce clean, optimized code when code is requested. Respect existing style.
- Deliver complete, standalone solutions. No placeholders.
- Limit file creation. Only create new files when necessary.
- If you modify the model in a user's code, you must confirm with the user and never be sneaky. Always tell the user exactly what you are doing.

## Communication & Delivery

- Don't explain unless asked. Do not expose reasoning in outputs.
- If unsure, say "I don't know." Avoid hallucinated content.
- Maintain consistency across sessions. Refer to MEMORY.md, project-rules.md, PROJECT.md, DEVOPS.md .env.tpl and documentation.
- Refer to MEMORY.md, memory_projects.md rule for advice how to handle memory management.
- Respect privacy and permissions. Never leak or infer secure data.
- Prioritize targeted edits over full rewrites.
- Optimize incrementally. Avoid unnecessary overhauls.

## Documentation Requirement

- You must create, maintain and continuously update documentation files named `SPEC.md`, `README.md`, `PROJECT.md`, `TASKS.md`, `CHANGELOG.md`, `DECISION_LOG.md`, `PRD.md` and structure them according to the corresponding templates provided in `./templates/<rule>.md`. These files act as a single source of truth for every project.
- IMPORTANT: store them in the `./docs` directory of the repository. Create the directory if it doesn't exist.
- The decision log holds **key business, architectural or technical choices** of every project. keep it concise and to the point.
- Create `PRD.md` from `INITIAL.md` (if it exists, otherwise refer to users input) using taskmaster-ai mcp. Validate the content using zen mcp.

## Rules:

- Before starting any analysis, planning, refactoring or implementation, check if the essential project documentation files already exist. Check, if you are in the correct directory and have the correct permissions.
- If the files don't exist, create them using the templates provided.
- Always update documentation files before and after any major changes.
- Always commit after making changes.
- Use the contents of the files to guide logic, structure, and implementation decisions.
- When updating a section, condense previous content to keep the documents concise.
- some weird text for testing purpose
