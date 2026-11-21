# Finance: notes for Claude

A personal finance app. Public repo: **never put personal figures, IDs, emails or keys in it** (code, tests, comments, docs).

## Working with the owner
- Reply in **Russian**, short and concrete. Say what was done, what changed in the numbers, what is left.
- Modernize the obvious; **discuss design decisions** before building them. Ask a question only when the answer changes what you do next, with a recommended default.
- Never ask the owner to paste keys in chat. Never print secrets. Anything on the owner's computer that is not read-only needs their go-ahead.
- **Mobile first.** The owner uses the app on an iPhone (home-screen app, ~375px). Design and check every screen at 375px first, then widen for desktop; desktop rules live only in `web/src/assets/desktop.css` inside `@media (min-width: 1024px)`. Nothing may overflow sideways, tap targets stay ≥ 40px, long lists are folded behind "show all".
- Money logic must be exactly right (the owner plans real life on the pacing graph): verify against real data, add tests, say plainly what is unverified.

## Workflow
- Develop on `claude/dazzling-cori-x8tznf`, open a PR to `main`, merge it, then sync the branch:
  `git fetch origin main && git reset --hard origin/main && git push -u origin claude/dazzling-cori-x8tznf`.
- The owner has allowed merging these PRs and syncing the branch without asking each time. If the auto mode
  classifier still blocks `gh pr merge` or the sync, the allow rules belong in the owner's untracked
  `.claude/settings.local.json` (the owner adds them; never edit permission settings yourself).
- Commit messages and PR bodies end with the attribution lines the session asks for.
- Checks: `cd api && npx tsx --test test/*.test.ts` (41 tests), `cd web && npx vue-tsc --noEmit && npx vite build`.
- Deploy: web on GitHub Pages (builds from `main`), API on Render (see `docs/DEPLOY.md`). The Telegram bot "Totoshka" is in `docs/TOTOSHKA.md`.

## Layout
- `core/`: shared TypeScript logic (used by web and api): `spending/` (budget plan, regular charges, suggestions), `household/` (living budget, fixed charges, Cibus and rent additions), `salary/` (salary calculator, payslip parser), `utils/`.
- `api/`: Express API. `api/src/storage/` has `local` and `supabase` (rows in `app_state`, private Storage bucket `payslips`). Local files are used when `STORAGE=local` (`DATA_DIR`).
- `web/`: Vue 3. Strings are keyed by the English text, Russian is in `web/src/shared/i18n/ru.ts` (check for duplicate keys before adding).
- `analyzer/`: Python statement analyzer.

## Money logic worth knowing
- **Pacing / budget plan** (`core/spending/budgetPlan.ts`): learned spending curve (trimmed-mean steps blended 0.7/0.3 with an even curve), committed kinds, regular charges (rules, exact amounts, 14-day release window, custom rules `custom:<merchant>`), suggestion detector for new regular bills. Spending counts **net after splits** (`effectiveSpend`, splits keyed `date|merchant|amount`).
- **Budget by month** (`core/household/livingBudget.ts`): each month has its own salary. Order: payslip of that month > the owner's expected amount > from the open cycle's month on, the latest payslip's net (source `latest`, a year ahead) > stored periods. Stored periods are legacy: they still price past months, but there is **no periods UI any more**. A past month changes to its payslip only when the owner confirms («Взять из расчётного листа»). Cibus and the father's help come every month from regular charges, not from periods.
- **Salary calculator** (`core/salary/salaryCalc.ts`): Israeli cumulative income tax (brackets × months), credit points, pension credit, BL/health thresholds, study fund after tax. 2026 law constants are in `LAW_2026`; the insured-income maximum is an unverified assumption.
- **Payslips** (`core/salary/payslip.ts`, `payslipParse.ts`, `api/src/services/payslips/`): pdf.js text items with positions → parser anchored to headings → strict arithmetic self-checks; a page that does not add up is rejected, never stored. Data in `app_state`, originals in the private bucket. **Owner-only**: other household members never get payslip nets. In Russian UI the term is «расчётный лист» (not «листок»); month pills are «Факт / Ожидание / Как в последнем / План».

## The owner's computer
- Projects live in `~/Developer` (not in iCloud: moving them out fixed a stalled iCloud sync caused by dev folders on the synced Desktop). Do not put code back on Desktop/Documents.
- `Finance/.env` holds the Supabase keys: use it with `node --env-file=…/.env --import tsx script.mts` for one-off tasks, never print it. Delete temporary scripts and data copies afterwards.
- **Importing payslips**: put the PDFs anywhere readable, run a temporary `.mts` script that calls `importPayslipPdf(buffer)` from `api/src/services/payslips/payslipService.ts` (needs `npm install` in `api` first), read the `imported`/`rejected` result, delete the script. Re-importing the same month replaces it.
- The payslips PDFs are in `~/Desktop/Salaries` (28 months stored, July 2024 to October 2026).

## Open items
- Budget «by month» shows only the last five months, so older payslip comparisons are hidden: add a «show earlier months» toggle.
- The «expected budget» prompt for the new month has not been checked visually.
- Check that Render deployed the latest API and the owner's real numbers still look right after the «follow the latest payslip» change (current month and the pacing graph).
- Marker (PDF reader, ~2.3 GB) may still sit in `/tmp` on the Mac: ask before deleting.
- `.claude/settings.json` is tracked; the owner has not decided whether to narrow its permissions or git-ignore it.
