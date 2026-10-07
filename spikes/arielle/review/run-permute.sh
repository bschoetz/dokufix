#!/bin/sh
# All variants, three at a time; the exact one and the canonical ones also with the grid's share.
cd "$(dirname "$0")"
printf '%s\n' "exakt (Mermaid)|10|--grid" "kanonisch, Tie-Break Element-ID|10|--grid" "kanonisch, Tie-Break Struktur|10|--grid" "kanonisch, Tie-Break Name|10|" "kanonisch, Tie-Break Bahn+Struktur|10|" "ohne Beschriftungsspalte|10|" "Beschriftung als Gewicht|10|" "XML-Reihenfolge wie buildGrid()|10|" "kanonisch Struktur, Beschriftung als Gewicht|10|" "kanonisch Struktur, ohne Beschriftungsspalte|10|" \
 | xargs -P 3 -I{} sh -c 'v="{}"; name=$(printf "%s" "$v" | cut -d"|" -f1); k=$(printf "%s" "$v" | cut -d"|" -f2); g=$(printf "%s" "$v" | cut -d"|" -f3); node permute.mjs "$name" "$k" $g 2>/dev/null'
