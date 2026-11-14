# Decisions

| Question | Choice | Reason |
| --- | --- | --- |
| Full build or design-first? | Design-first build on demo data | Owner's instruction mid-session: limited budget, design matters most, it does not need to work without the pipeline. |
| Three-direction design lab? | Skipped; one direction ("Plywood") built directly | Same budget constraint. Rejected alternatives are noted in DESIGN.md. |
| Where does data come from? | A small hand-written repertoire in `app/src/lib/demo.ts` | No pipeline or fixtures yet. Move legality is real (chess.js); frequencies, results, evals and stats are illustrative. |
| Light or dark? | Light app, dark training room | Calm overview, focused board. No theme setting (not in v1). |
| Promotion picker | Auto-queen for now | No demo line promotes. |
| Storage | localStorage for settings and demo progress | Dexie arrives with the real SRS engine. |
| No chess.com name at onboarding | Start at band 1200 with 8-move lines | Simplest reading of the brief's defaults. |
