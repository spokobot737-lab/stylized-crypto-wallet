# Security / FRAME Wallet 0.3

This is experimental, unaudited software. The application starts on Mainnet; switch to test networks for initial verification. Never submit a real seed in a GitHub issue or support message.

Trust boundaries: OS CSPRNG → BIP39 → locally derived native chain keys. Seed/passphrase encrypted with authenticated AES-256-GCM and a fixed bounded scrypt cost. Private signing occurs only in Electron main, not the React bundle. Mnemonic is revealed to renderer only during initial backup or explicit PIN-authenticated backup, and never sent to network providers.

A 90-second immutable main-process transaction draft, unlocked application session, and OS modal confirmation bind signing to displayed recipient, chain, value and fee. Drafts are consumed before broadcasting. A known hash is saved before submission; timeout/transport errors are treated as uncertain and are not retried automatically. Check the explorer before creating another transfer.

Limits: no independent audit, no Authenticode signing, dependency supply-chain trust, JavaScript memory cannot be fully zeroized, no hardware protection, public RPC availability and privacy, one reused BTC address, no encrypted transaction metadata. Test fixtures use an explicitly public BIP39 reference phrase and temporary data directories, never a user's wallet. Every CI installer must pass known address vectors, vault integrity checks, offline signature tests, and real Electron smoke tests.

BTC PSBT inputs are checked against the full previous transaction hash, output script and amount. Fees use conservative size estimates, a maximum rate of 1000 sat/vB and maximum total 0.01 BTC; ETH maximum total fee is 0.05 ETH. The UI shows the final fee before approval. Do not blindly increase caps to bypass an error.

Do not publish vaults, seeds, screenshots of backups, signing keys or RPC credentials. Report issues privately to the repository owner. Before distributing more broadly, commission an independent cryptographic/application security review, implement signed updates and release provenance, and test on funded testnets and Windows hardware.


Version 0.2 uses a collection vault (`app.vault`): one 6–12 digit application PIN plus a random 256-bit device secret protected by Electron async safeStorage. Scrypt derives the AES-256-GCM key from both; the device secret and all mnemonics are never sent to the renderer except explicit backup. There is no Linux basic_text or plaintext fallback. The session retains the derived collection key only while unlocked. PIN attempts are rate-limited with persisted delays; OS user-account compromise remains outside this protection. PIN change re-encrypts the complete collection atomically. The file is OS-profile-bound: recovery across devices requires each seed/passphrase.

Migration reads the legacy password vault, creates the collection exclusively, preserves derivation paths and the original vault bytes, and associates legacy transaction history only with the migrated wallet. Other wallets have UUID-scoped history files. Switching wallets invalidates outstanding transaction drafts and balance requests. Signing checks both session epoch and active wallet ID. No repeated PIN is required to switch or send; the native immutable transaction confirmation remains mandatory. Seed backup and PIN change require PIN reauthentication.

Version 0.3: the renderer can request copying public addresses/hashes only through validated IPC. The main process awaits the system clipboard write and verifies the readback; no generic clipboard-read API or seed-copy action is exposed. Network history uses only public addresses and bounded, timed, validated API responses, with partial-provider errors kept visible. Local broadcasts are not treated as confirmed. Session epochs reject stale history after wallet switch/lock. Public history includes native coins only, not token/NFT indexing.
