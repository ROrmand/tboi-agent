# Repository and local-play guidance

For installation, read docs/AGENT_SETUP.md and use the shared setup CLI. Begin with inspect and plan using --json; review a dry run before mutations.

Never display or request NEBIUS_API_KEY in chat, command arguments, or diagnostics. Ask the user to edit .env privately. Do not read their existing .env for troubleshooting output.

Native replacement requires explicit user approval and setup-owned backups. Do not silently bypass missing runtime pins. Do not change security settings, delete reservation ledgers, or operate on an active Isaac game. Never select or modify save slots; Save File 1 is outside testing scope.

For development, run npm run test:setup for onboarding/packaging changes and npm test before release. Do not claim offline tests prove live acceptance. Do not publish releases or create an external fork merely to verify local changes.
