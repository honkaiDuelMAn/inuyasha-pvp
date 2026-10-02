# SDD ledger — plan: docs/superpowers/plans/2026-10-03-pvp.md

Ruling: User delegated engine choice and explicitly said to proceed; retain written design/plan but execute inline without additional approval handoffs.
Ruling: This archive is not a Git repository. Use a new isolated project under this chat's work directory; do not alter the Downloads original.
Ruling: Preserve original character-specific card compatibility. Draw from the intersection of both selected characters' original bonus pools. Cost if wrong: user may prefer all summons unlocked; this would require animation/card compatibility work.
Pre-flight: Tasks 1/3/4 share bridge protocol; Tasks 2/3/4 share room events. Exact callback and event names are defined by the plan and will be tested through real browser and socket integration.
Task 2: complete — 16/16 real room-rule tests pass; zero-card RNG, shared bonuses, 64 character pairs, sealed hands, reselection and disconnect.
Task 1: complete — original Flash 6 header and all 1459 tags unchanged; Flash 8 bridge registered callbacks and sent ready in actual Ruffle. Task 3: 17/17 room and real HTTP/WebSocket integration tests pass; browser gameplay validation in progress.
Task 4: complete — actual two-browser 6-round victory, reselection with identical characters and 0 bonus cards, original reports agree, mid-animation guest departure and replacement pass.
Final review: independent gpt-6-astra reviewer, 2 Important findings, no Critical or Minor findings.
Final: fixed original picker/server energy mismatch and rejected submission recovery — original picker accepts energyUp/Kikyo/spiritPower and current-round retry tests RED→GREEN, suite 20/20 plus preservation 3/3. Actual browser retries and Kikyo hand pass.
Final: fixed readiness during character reselection — reopening character selection cancels ready test RED→GREEN, suite 20/20 plus preservation 3/3. Actual browser reselection-before-opponent-ready passes.
Final: Ruling: external two-PC reachability is environment-dependent — document that only independent local browsers and real sockets were tested; cost if wrong: user must configure reachable LAN/VPN/port address.
Final: Ruling: authoritative anti-cheat engine reimplementation is outside requested original-preserving design — compare both actual engines; cost if wrong: modified clients are not secured for ranked competitive use.
Final: animation cancellation was tested in actual mid-animation departure and replacement; concern resolved. Packaging completeness will be verified in the final delivery copy.
Final: Ruling: keep isolated source branch and deliver portable files; user delegated implementation and no remote Git repository exists — cost if wrong: later changes use delivered source instead of original archive.
