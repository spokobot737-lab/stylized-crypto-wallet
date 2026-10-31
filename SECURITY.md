# Security / FRAME Wallet 0.1

This is experimental, unaudited software. Start on test networks. Never submit a real seed in a GitHub issue or support message.

Trust boundaries: OS CSPRNG → BIP39 → locally derived native chain keys. Seed/passphrase encrypted with authenticated AES-256-GCM and a fixed bounded scrypt cost. Private signing occurs only in Electron main, not the React bundle. Mnemonic is revealed to renderer only during initial backup or explicit password-authenticated backup, and never sent to network providers.

A 90-second immutable main-process transaction draft, password reauthentication, and OS modal confirmation bind signing to displayed recipient, chain, value and fee. Drafts are consumed before broadcasting. A known hash is saved before submission; timeout/transport errors are treated as uncertain and are not retried automatically. Check the explorer before creating another transfer.

Limits: no independent audit, no Authenticode signing, dependency supply-chain trust, JavaScript memory cannot be fully zeroized, no hardware protection, public RPC availability and privacy, one reused BTC address, no encrypted transaction metadata. Test fixtures use an explicitly public BIP39 reference phrase and temporary data directories, never a user's wallet. Every CI installer must pass known address vectors, vault integrity checks, offline signature tests, and real Electron smoke tests.

BTC PSBT inputs are checked against the full previous transaction hash, output script and amount. Fees use conservative size estimates, a maximum rate of 1000 sat/vB and maximum total 0.01 BTC; ETH maximum total fee is 0.05 ETH. The UI shows the final fee before approval. Do not blindly increase caps to bypass an error.

Do not publish vaults, seeds, screenshots of backups, signing keys or RPC credentials. Report issues privately to the repository owner. Before distributing more broadly, commission an independent cryptographic/application security review, implement signed updates and release provenance, and test on funded testnets and Windows hardware.
