# Source provenance for 0.6.0

The editable 0.5.0 TypeScript project was not available after the workspace reset. The public 0.5.0 installer was downloaded and its actual Electron bundle inspected. The existing 0.4.0 repository is the base of this update. `electron/chat/{protocol,store,transport}.ts` were reconstructed from the executable 0.5.0 bundle and then upgraded here. They are not represented as the missing original TypeScript sources. They retain runtime Zod validation and have regression tests; recovered sections temporarily use `@ts-nocheck`.

Installer used for recovery:
`FRAME-Wallet-0.5.0-Setup-x64.exe`
SHA256: `d46cec8bab774e420f64fbdb7869d1718cd74fb7853a0f310ffc13a87b56708b`

No seed, wallet file, PIN, chat secret or user history was used in this reconstruction. The original installer and v0.5.0 tag are preserved. In 0.6.0 the full editable sources, lockfile and tests belong to the version's source commit.

Compatibility invariants: same app ID, app data directory, PIN and DPAPI-protected vault format, mnemonic/passphrase derivation, chat private key property and per-key history filename. Chat history gets an encrypted, exclusive `.v1.bak` before migration; message IDs and queued NIP-59 events are retained. Renewing authorization reuses the key and preserves the existing profile and earliest authorization time. No automatic key replacement or wallet reset.
