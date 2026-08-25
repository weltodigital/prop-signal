#!/usr/bin/env bash
#
# Copies the secrets from .env.local into a Vercel project.
#
#   vercel login          # once, interactive
#   vercel link           # once, pick the prop-signal project
#   pnpm vercel:env
#
# Adds each variable to production, preview and development. Existing values
# are replaced. Nothing is printed, so this is safe to run with someone
# watching your screen.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f .env.local ]; then
  echo "No .env.local found. Nothing to copy." >&2
  exit 1
fi

if [ ! -d .vercel ]; then
  echo "This directory is not linked to a Vercel project yet. Run 'vercel link' first." >&2
  exit 1
fi

# Not copied.
#   NEXT_PUBLIC_SITE_URL is set per environment below, because the fallback
#   origin differs between production and a preview.
#   VERCEL_OIDC_TOKEN is written into .env.local by `vercel link`. It is a
#   short-lived local credential, not a project setting, and pushing it would
#   put a token that expires within the hour into every deployment.
SKIP="NEXT_PUBLIC_SITE_URL VERCEL_OIDC_TOKEN"

pushed=0
while IFS= read -r line; do
  case "$line" in ''|\#*) continue ;; esac
  key="${line%%=*}"
  value="${line#*=}"

  [ -z "$value" ] && continue
  case " $SKIP " in *" $key "*) continue ;; esac

  for target in production preview development; do
    vercel env rm "$key" "$target" --yes >/dev/null 2>&1 || true
    printf '%s' "$value" | vercel env add "$key" "$target" >/dev/null
  done

  echo "  set $key"
  pushed=$((pushed + 1))
done < .env.local

# The live origin, used only where there is no request to read one from.
for target in production preview development; do
  vercel env rm NEXT_PUBLIC_SITE_URL "$target" --yes >/dev/null 2>&1 || true
done
printf '%s' "https://www.usepropsignal.com" | vercel env add NEXT_PUBLIC_SITE_URL production >/dev/null
printf '%s' "https://www.usepropsignal.com" | vercel env add NEXT_PUBLIC_SITE_URL preview >/dev/null
printf '%s' "http://localhost:3000" | vercel env add NEXT_PUBLIC_SITE_URL development >/dev/null
echo "  set NEXT_PUBLIC_SITE_URL"

echo
echo "$((pushed + 1)) variables set. Redeploy for them to take effect:"
echo "  vercel --prod"
