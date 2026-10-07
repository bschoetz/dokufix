#!/bin/sh
cd "$(dirname "$0")"
printf '%s\n' "exakt (Mermaid)" "kanonisch, Tie-Break Element-ID" "kanonisch, Tie-Break Name" "kanonisch, Tie-Break Struktur" "kanonisch Struktur, ohne Beschriftungsspalte" \
 | xargs -P 2 -I{} sh -c 'node rename.mjs "{}" 10 2>/dev/null'
node grid-share.mjs 10 2>/dev/null
