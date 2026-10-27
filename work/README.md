# Local scratch only

Disposable session output, logs, and compact receipts belong here. Everything
except this README is ignored. Product source and reusable tools belong outside
`work/`. Never clone or build REPENTOGON here.

Keep an existing checkout/build outside this repository and configure
`REPENTOGON_SOURCE` and `REPENTOGON_BUILD_DIRECTORY` in `.env`. The ignored
`.reference-repentogon/` remains supported for compatibility, not distribution.

Use `npm run repentogon:apply-binding`, reconfigure/build REPENTOGON externally,
then close Isaac before explicitly running `npm run repentogon:reset`.
Use `npm run mod:sync-safe` for optional protected-file verification and a
compact receipt. Never retain full installed-mod per-file hash inventories.
