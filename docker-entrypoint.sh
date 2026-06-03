#!/bin/sh
set -e
cd /app

case "$1" in
  approve)
    shift
    exec node codes/cli.js approve "$@"
    ;;
  start|"")
    exec node codes/index.js
    ;;
  *)
    exec "$@"
    ;;
esac
