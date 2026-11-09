#!/bin/sh
cd "$(dirname "$0")"
PORT=8731
printf '\nNo Mac: http://localhost:%s\n' "$PORT"
printf 'Deixe esta janela aberta enquanto consulta o guia neste computador.\n\n'
exec python3 -m http.server "$PORT" --bind 127.0.0.1
