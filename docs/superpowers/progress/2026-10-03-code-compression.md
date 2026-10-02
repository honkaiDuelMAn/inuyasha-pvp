# Shorter connection codes — 2026-10-03

User requests shorter privately exchanged connection codes, retaining no external connection server and all gameplay.
Bounded change to the existing manual codec and its async callers. Persistent user delegation and publication scope apply; no additional permission handoff.
Selected lossless fixed dictionary + compact metadata + native gzip, IY2 prefix. Keep IY1 decode and reply to IY1 invitations in IY1 so older hosts can read the answer. No information removed from SDP. Bind format dictionary order to IY2.
RED: compressed-format/size assertion failed with original IY1; GREEN with 966→316/319 fixture chars. Roundtrip Unicode/unknown SDP/zero bytes and corrupt/truncated/oversized/expansion rejection tests pass.
Legacy compatibility RED: new guest answered IY1 invitation in IY2; GREEN with legacy response option and a real data-channel handshake. Actual new code ~966→323/327 characters.
Async decode captures initial DirectRoom generation so cancel during decoding cannot re-create a room. Compression promise runs under ManualPeer abort guard.
Verification: Node26/26, original preservation3/3; actual new/legacy ManualPeer data channels and code rejection/cancel/timeout; DirectRoom invalid replacement/mode-switch/cancel recovery pass. Fresh review and full static browser run pending.

Fresh review: gpt-6-astra found no Critical/Important defects; independently passed100 mixed-token/Unicode/NUL roundtrips and no-compression fallback. Minor frozen-format compatibility test added and passes, no deferred findings. Node27/27 + original preservation3/3 pass. Full staged static original victory/reselection0/disconnect/new invitation/replacement PASS with IY2 and no external API/WebSocket/ICE servers. Publish same Pages URL under existing user authorization.

Published c0eea62: Pages run 37065457446 success. Live public two-browser test PASS: IY2 connection/shared3, original victory/reselection0, disconnect/new invitation/stale answer/replacement; no external API/WebSocket/assets and empty ICE servers. All 36 served content files match the verified v1.1.1 SHA-256 manifest; .nojekyll is a deployment marker and is not served. Deliverable ZIP CRC and hashes verified. Test scope remains two independent browser contexts on one PC; no claim of universal cross-network reachability.
