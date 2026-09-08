# SELIN AI CODING STANDARD v1.0

1. FILES: max 300 lines per file, max 80 lines per function. Bigger file = split into modules. No exceptions.
2. NAMES: short and clear: prompt, row, token, tmpPath. Banned: finalEnglishPrompt, cachedRowData, tempFilePathVariable.
3. COMMENTS: only "why", never "what". Commenting the obvious is forbidden.
4. GUARDS: one guard clause at function entry. Cascades of five ifs in a row = architecture defect.
5. LOGS: format log.info('event', {context}). No emoji. No template walls.
6. FALLBACK: one simple fallback per scenario. Twenty regex cases = a stub, mark TODO(architect).
7. ERRORS: never swallow. Handle meaningfully or rethrow. Empty catch = forbidden.
8. MODULES: one responsibility per file. Adapter = transport only, business logic lives in services/.
9. DEAD CODE: delete, do not comment out. History lives in git.
10. REVIEW: any AI patch passes architect review before merge. No exceptions.
