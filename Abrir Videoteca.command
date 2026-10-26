#!/bin/zsh
cd "${0:A:h}"
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
node start.mjs || exit 1
open http://localhost:4317
echo 'Videoteca abierta. Puedes cerrar esta ventana; el servidor seguirá funcionando.'
