# Vision

**JSON Formatter** — a private, lossless JSON formatter for developers: paste anything, get it
formatted or see exactly what's broken. Nothing leaves your browser, and nothing about your
data changes except whitespace.

## Problem
Developers constantly read and fix JSON payloads — API responses, logs, configs, fixtures.
The usual online formatters show ads, may upload what you paste (in 2025 two popular ones
exposed tens of thousands of saved payloads containing credentials), silently change data
(large IDs rounded, keys reordered), freeze on large inputs, or give vague error messages.

## Who it is for
PER-01 (daily user) and PER-02 (portal maintainer who embeds the tool).

## Value
1. **Lossless** (PRN-02) — formatting changes whitespace only.
2. **Private by construction** (PRN-01) — no data ever leaves the device.
3. **Errors that point** (PRN-03) — exact location plus a plain-language hint.
4. **Never blocks** (PRN-04) — large inputs stay responsive.

## Context
The tool runs at its own address and is embedded in an existing developer-tools portal (the
"host"). It must also work standalone (PRN-05).

## Non-goals
Servers, accounts, history, share links, analytics, schema validation, editing in the tree.
Format conversion, diff, and queries are later-milestone candidates (see `60-delivery/roadmap.md`).
