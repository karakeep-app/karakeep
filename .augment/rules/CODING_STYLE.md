---
type: "agent_requested"
description: "coding style guidelines and best practices"
---

# CURSOR USAGE STANDARDS – READ THIS BEFORE TOUCHING CODE
## CONTEXT FIRST — NO GUESSWORK
- DO NOT WRITE A SINGLE LINE OF CODE UNTIL YOU UNDERSTAND THE SYSTEM.
- IMMEDIATELY LIST FILES IN THE TARGET DIRECTORY.
- ASK ONLY THE NECESSARY CLARIFYING QUESTIONS. NO FLUFF.
- DETECT AND FOLLOW EXISTING PATTERNS. MATCH STYLE, STRUCTURE, AND LOGIC.
- IDENTIFY ENVIRONMENT VARIABLES, CONFIG FILES, AND SYSTEM DEPENDENCIES.
- REFERENCE EXISTING CODE FOR INSPIRATION AND BEST PRACTICES.
- REFERENCE DOCUMENTAION SOURCES as provided by mcp-toolguide.md
- Use MCP tools to, plan, search, manage dependencies, standards, best practices or documentation.

## CHALLENGE THE REQUEST — DON’T BLINDLY FOLLOW
- IDENTIFY EDGE CASES IMMEDIATELY.
- ASK SPECIFICALLY: WHAT ARE THE INPUTS? OUTPUTS? CONSTRAINTS?
- QUESTION EVERYTHING THAT IS VAGUE OR ASSUMED.
- REFINE THE TASK UNTIL THE GOAL IS BULLET-PROOF.

## HOLD THE STANDARD — EVERY LINE MUST COUNT
- CODE MUST BE MODULAR, TESTABLE, CLEAN.
- COMMENT METHODS. USE DOCSTRINGS. EXPLAIN LOGIC.
- SUGGEST BEST PRACTICES IF CURRENT APPROACH IS OUTDATED.
- IF YOU KNOW A BETTER WAY — SPEAK UP.

## ZOOM OUT — THINK BIGGER THAN JUST THE FILE
- DON’T PATCH. DESIGN.
- THINK ABOUT MAINTAINABILITY, USABILITY, SCALABILITY.
- CONSIDER ALL COMPONENTS (FRONTEND, BACKEND, DB, USER INTERFACE).
- PLAN FOR THE USER EXPERIENCE. NOT JUST THE FUNCTIONALITY.

## WEB TERMINOLOGY — SPEAK THE RIGHT LANGUAGE
- FRAME SOLUTIONS IN TERMS OF APIs, ROUTES, COMPONENT STRUCTURE, DATA FLOW.
- UNDERSTAND FRONTEND-BACKEND INTERACTIONS BEFORE CHANGING EITHER.

## ONE FILE, ONE RESPONSE
- DO NOT SPLIT FILE RESPONSES.
- DO NOT RENAME METHODS UNLESS ABSOLUTELY NECESSARY.
- SEEK APPROVAL ONLY WHEN THE TASK NEEDS CLARITY — OTHERWISE, EXECUTE.

## ENFORCE STRICT STANDARDS
- CLEAN CODE, CLEAN STRUCTURE.
- 1600 LINES PER FILE MAX.
- HIGHLIGHT ANY FILE THAT IS GROWING BEYOND CONTROL.
- USE LINTERS, FORMATTERS. IF THEY’RE MISSING — FLAG IT.

## MOVE FAST, BUT WITH CONTEXT
- ALWAYS BULLET YOUR PLAN BEFORE EXECUTION:
- WHAT YOU’RE DOING
- WHY YOU’RE DOING IT
- WHAT YOU EXPECT TO CHANGE

## ABSOLUTE DO-NOTS
- DO NOT CHANGE TRANSLATION KEYS UNLESS SPECIFIED.
- DO NOT ADD LOGIC THAT DOESN’T NEED TO BE THERE.
- DO NOT WRAP EVERYTHING IN TRY-CATCH. THINK FIRST.
- DO NOT SPAM FILES WITH NON-ESSENTIAL COMPONENTS.
- DO NOT CREATE SIDE EFFECTS WITHOUT MENTIONING THEM.

## REMEMBER
- YOUR WORK ISN’T DONE UNTIL THE SYSTEM IS STABLE.
- THINK THROUGH ALL CONSEQUENCES OF YOUR CHANGES.
- IF YOU BREAK SOMETHING IN ONE PLACE, FIX IT ACROSS THE PROJECT.
- CLEANUP. DOCUMENT. REVIEW.

## THINK LIKE A HUMAN
- CONSIDER NATURAL BEHAVIOUR.
- HOW WOULD A USER INTERACT WITH THIS?
- WHAT HAPPENS WHEN SOMETHING FAILS?
- HOW CAN YOU MAKE THIS FEEL SEAMLESS?
- EXECUTE LIKE A PROFESSIONAL CODER. THINK LIKE AN ARCHITECT. DELIVER LIKE A LEADER.

## code_style:
- Comments in English only
- Prefer functional programming over OOP
- Use separate OOP classes only for connectors and interfaces to external systems
- Write all other logic with pure functions (clear input/output, no hidden state changes)
- Functions must ONLY modify their return values - never modify input parameters, global state, or any data not explicitly returned
- Make minimal, focused changes
- Follow DRY, KISS, and YAGNI principles
- Use strict typing (function returns, variables) in all languages
- Use named parameters in function calls when possible
- No duplicate code; check if some logic is already written before writing it
- Avoid unnecessary wrapper functions without clear purpose
- Prefer strongly-typed collections over generic ones when dealing with complex data structures
- Consider creating proper type definitions for non-trivial data structures
- Native types are fine for simple data structures, but use proper models for complex ones
- Try to avoid using untyped variables and generic types where possible
- Never use default parameter values in function definitions - make all parameters explicit

## error_handling:
- Always raise errors explicitly, never silently ignore them
- If an error occurs in any logical part of code, raise it immediately and do not continue execution
- Use specific error types that clearly indicate what went wrong
- Avoid catch-all exception handlers that hide the root cause
- Error messages should be clear and actionable
- Log errors with appropriate context before raising them

## python_specifics:
- Prefer Pydantic over TypedDict for data models (e.g., `class ContactData(BaseModel): ...`)
- Avoid `Any` and `@staticmethod`
- Use `pyproject.toml` over `requirements.txt` when possible
- For complex structures, avoid generic collections like `List[Dict[str, Any]]`
- Raise specific exceptions like `ValueError` or `TypeError` instead of generic `Exception`
- Only use classes for clients that connect to external systems (e.g., `NotionClient`)
- For business logic, use pure functions with client as first parameter: `def change(notion_client: NotionClient, param1: str, param2: int) -> Result:`

##typescript_specifics:
- Prefer interfaces over type aliases for complex object shapes
- Use typed objects for complex state management
- Use Error objects with descriptive messages: `throw new Error('Specific message')`
- Leverage discriminated unions for complex type scenarios

## libraries_and_dependencies
- Install in virtual environments, not globally
- Add to project configs, not one-off installs
- Use source code exploration for understanding
- Prefer project-level dependency management over individual package installation:
  - GOOD: `pip install -r requirements.txt`
  - BETTER: Use `pyproject.toml` with modern Python packaging
- When adding dependencies, update the appropriate project configuration file, not just the environment

## terminal_usage
- Run `date` for date-related tasks
- Use GitHub CLI with `printf` for multiline text:
  `git commit -m "$(printf "Title\n\n- Point 1\n- Point 2")"`
- Always use non-interactive git diff commands with: `git --no-pager diff` or `git diff | cat`. NO `git diff` or `git diff --cached`.
- Always prefer commands with parameters that don't require user interaction over interactive ones (use flags, environment variables, or configuration files to avoid prompts)

## planning_practices
- User can ask you to create a plan for the feature implementation
- You MUST create a tmp directory
- You MUST create a markdown file with the feature plan in the tmp directory
- This feature plan file must contain the following sections:
  1. Overview of current state related to the feature
  2. Overview of the final state of the feature
  3. List of all files to change with text description of what to change (not a code)
  4. Checklist of all tasks that need to be done in 2-level markdown checkbox style
- This feature plan file MUST be minimalistic and contain only the most important minimal changes related to the feature, all additional changes can be described as ideas in additional section, but MUST NOT be implemented if user didn't ask for them

## repository_practices
- Read `README.md` if there is no `./rules`, `./cursor/rules` or `./augment/rules` directory containing the necessary rules and documentation.
- Summarize project before working on it

## code_changes
- You MUST respect existing code style and patterns if the user didn't specify otherwise
- You MUST suggest only minimal changes related to current user dialog
- You MUST change as few lines as possible while solving the problem
- You MUST focus only on what the user is asking for in the current dialog, no extra improvements
- You MUST understand the existing codebase before suggesting changes
- You MUST start with reading related files and codebase before suggesting changes

# Test multiple rules Sun Aug  3 01:51:24 CEST 2025
