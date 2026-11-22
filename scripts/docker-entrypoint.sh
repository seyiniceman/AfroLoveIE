#!/bin/sh
set -eu

node scripts/validate-runtime-env.mjs

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  ./node_modules/.bin/prisma migrate deploy
fi

if [ "${APP_ENV}" = "development" ] && [ "${DEMO_DATA_ENABLED:-false}" = "true" ] && [ "${LOAD_DEMO_DATA:-false}" = "true" ]; then
  npm run db:seed
fi

exec node server.js
