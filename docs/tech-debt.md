# Tech debt & deferred decisions

Things found while working on something else, deliberately not fixed at the time. Each
entry says what it is, why it was deferred, and what acting on it would cost — so the
decision can be re-taken later with the same information, instead of re-derived.

Add an entry when you find something real but out of scope. Delete it when it's done.


## Cognitive-complexity ratchet sits at 27, not the target 15 (PSG-49, PSG-50)

`sonarjs/cognitive-complexity` is set to the current worst function (27) so the gate
passes today and blocks anything worse. Three functions are above the target of 15:
`resolveDraftRows` (27) and `validateCommitRows` (23) in `sales-import.resolver.ts`, and
`UpdateSaleUsecase.execute` (21). Deferred because splitting them is a refactor of
hardened, well-tested code. Acting costs one extraction pass per function, then lowering
the threshold in `eslint.config.mjs`.
