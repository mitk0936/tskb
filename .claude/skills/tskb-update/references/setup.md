# tskb setup & troubleshooting

If the build fails with a TypeScript error, check:
- `docs/tsconfig.json` has `"jsxImportSource": "tskb"`
- `baseUrl` and `rootDir` point to the repo root (e.g., `"../"`)
- Import paths in `.tskb.tsx` files end with `.js` (NodeNext module resolution)

## Monorepo tips

- Place `docs/` at the workspace root.
- Set `baseUrl` and `rootDir` to `"../"` from the docs folder (or adjust for your layout).
- Add `paths` entries for workspace packages if needed.
