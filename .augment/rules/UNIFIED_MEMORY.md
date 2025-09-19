---
type: "always_apply"
---

# Unified Memory Rule

This is the standard memory rule file for all assistants. Use this file instead of MEMORY.md.

Goals
- One canonical memory rule to avoid drift across repos
- Clear guidance for retrieval and storage across memory systems
- Lightweight enough to include in all assistants without context bloat

Retrieve before you answer (search-first)
- Personal/context history → openmemory
- Technical/code context → byterover
- Project/workflow knowledge → nova-memory

Examples
- openmemory:search-memories({ query: "<user question>" })
- byterover-retrive-knowledge({ query: "<technical context>" })
- nova-memory:memory({ action: "query", query: "<project context>" })

Store important outcomes
- Personal preferences and background → openmemory:add-memory
- Working code/config decisions → byterover-store-knowledge
- Project status/decisions/next steps → nova-memory:quick({ action: "save", content })

Conflict handling
1) Acknowledge differences explicitly
2) Prefer most recent, highest-signal source
3) Ask for clarification if critical

Periodic status
- nova-memory:quick({ action: "status" }) every 10–12 exchanges during active multi-step work

Efficiency rules
- Avoid redundant storage across systems
- Keep references lightweight; fetch details on demand
- Aim for 2–4 memory calls per conversation

Notes
- Replaces legacy MEMORY.md
- Referenced as .rules/UNIFIED_MEMORY.md in workflows and .env.tpl
- Safe fallback for AI_RULES_COMMON

