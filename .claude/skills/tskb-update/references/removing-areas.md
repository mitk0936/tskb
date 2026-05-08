# Removing or moving an area

Deleting a Folder, Module, or Export breaks every `<Doc>`, `<Flow>`, or `<Relation>` that references it — the build fails on the missing key.

Recovery:

1. `npx --no -- tskb search "<oldKey>" --plain` and `tskb context "<oldKey>" --plain` — find every dependent.
2. Update or delete the referencing docs **as part of the same change**. Don't leave stale references; don't comment out — delete.
3. Rebuild to confirm the graph still resolves.
