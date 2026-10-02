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
Delivery: fixed Windows launcher UTF-8/LF parsing failure — actual bundled launcher HTTP startup test RED→GREEN after CRLF normalization; added .gitattributes to preserve it.
Task 5: complete — portable folder and ZIP; actual delivered Windows launcher serves HTTP; delivered Node21/21, preservation3/3, complete browser victory/reselection/disconnect and bonus1/2 scenarios pass. Original Downloads unchanged; owned test servers stopped after validation.
Follow-up 1.0.1: title music persists because PvP skips original userDoneWithVersus, which stops themeSong and youDie. Actual dual-browser Flash Sound regression RED (titlePlaying true, stops0 on both) → GREEN after reproducing the two original track stops in pvpStart. Actual title playback position no longer advances; original battle effect and next round pass. Node21/21 and preservation3/3 pass; original game-pvp.swf unchanged.
Follow-up cards: original catalog gives every character five common bonuses plus one restricted summon. Original SWF frame labels contain Shippo i/ke/m; Demons ka/n/s; Jaken s; Kirara i/ke/ko/m/sa; Wolves ko. Extra unused labels exist but no summon has all eight character card versions.
