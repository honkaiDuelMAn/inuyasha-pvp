# Browser PvP Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, preserving the user's instruction to choose the method and proceed.

**Goal:** Publish the preserved game as static Pages with browser-hosted PvP and no external connection servers.
**Architecture:** Shared room rules run in the host browser; manual full offer/answer codes establish a direct reliable WebRTC data channel. Existing Node mode continues through its current WebSocket transport.
**Tech Stack:** Native WebRTC, ES modules, self-hosted Ruffle, existing Flash 6/8 resources, Playwright, Node tests, GitHub Pages.
**Spec:** docs/superpowers/specs/2026-10-03-browser-pvp-design.md

## Global constraints

No connection servers including STUN or TURN; `iceServers: []`. No new game engine or combat changes. The owner's PC is irrelevant after static publication. Full two-way connection codes and network reachability limits are visible. Existing Node mode remains functional. Use relative asset paths and only self-hosted dependencies.

## Review focus

- Leave during ICE gathering must cancel late callbacks and prevent a resurrected room.
- Malformed/oversized/mismatched/stale codes must preserve a usable current room.
- Guest departure and replacement must reset the original engine and regenerate an invitation.
- A direct connection failure must not hang indefinitely or pretend the other player joined.
- GitHub Pages repository subpaths must work without any local HTTP/API process.

## Task 1: Shared browser room rules

Files: public/net/room-rules.mjs, public/net/catalog.mjs, server/rooms.mjs, tools/build.py, tests/browser-rules.cjs.
Interface: preserve RoomService, catalog, drawBonus, validateMoves exports; use browser crypto randomness.
- [ ] Write browser import/room creation test and run to observe missing-module failure.
- [ ] Extract unchanged room logic and original catalog, remove Node dependencies and inject default browser crypto.
- [ ] Run browser test and the existing room/server suite; commit.

## Task 2: Manual connection and shared UI transport

Files: public/net/manual-peer.mjs, public/net/direct-room.mjs, public/direct.html, public/direct-ui.mjs, public/app.mjs, public/index.html, public/style.css, tests/direct-browser.cjs.
Interface: createDirectRoom({onEvent,onStatus}) returns create(count), join(code), accept(code), newInvite(), send(event), close(), role, roomCode. ManualPeer exposes offer/answer/accept and data events with empty ICE server list.
- [ ] Write actual static two-context invitation/answer test; reject invalid input, mismatched/stale answer, verify no WebSocket/API/STUN/TURN requests, cancellation and timeout.
- [ ] Run RED then implement peer transport and browser room authority, queued host events and guarded guest messages.
- [ ] Add dedicated Korean static UI for full invitation/response codes, cancellation/retry and replacement. Adapt app transport and relative resources; retain Node entry.
- [ ] Run GREEN through actual original victory, 3 shared bonuses, reselection with 0, departure/replacement, and existing Node browser regressions; commit.

## Task 3: Static publication

Files: tools/pages.py, .github/workflows/pages.yml, README.txt, web README, THIRD-PARTY.txt, verification report.
- [ ] Stage static-only public files with direct.html renamed index.html; verify the nested-path artifact using the browser suite.
- [ ] Final fresh review required by executing-plans; fix material findings with RED/GREEN.
- [ ] Commit and push the new public repository including required assets and licenses. Enable Pages and deploy through the official workflow.
- [ ] Verify deployed URL and real browser two-way connection/combat there. Package a standalone static deliverable and report network restrictions and tested scope.
