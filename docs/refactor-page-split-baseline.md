# Page split baseline

Recorded on 2026-08-31 before splitting `app/page.tsx`.

- Branch: `codex/refactor-page-split`
- `npm run test:ux`: 6/6 passing
- `npm run eval:agent`: 13/13 passing (score 100)
- Manual local check: home route rendered successfully with no browser console warnings or errors; sidebar, composer, command panel and Living Eye controls were present.
- `app/page.tsx`: 3,254 physical lines at baseline.

The untracked `data/runtime/` directory predates this refactor and is intentionally excluded from commits.
