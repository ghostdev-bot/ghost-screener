#!/bin/bash
# Ghost Screener: refresh the fallback snapshot site/data/trending.json (raw GeckoTerminal trending pools, page 1)
# and redeploy ghostscreener.surge.sh. The live site still fetches GeckoTerminal/DexScreener in the browser;
# this snapshot is only shown (labelled "cached copy") when a visitor's live API calls fail or are rate limited.
# Cost: 1 free GeckoTerminal call, no keys, no Helius credits. Keeps the old snapshot if the API call fails.
set -euo pipefail
cd /workspace/ghostscreener
mkdir -p .cache site/data
TMP=$(mktemp)
ok=0
for i in 1 2 3; do
  if curl -fsS --max-time 20 -H 'Accept: application/json' 'https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token,dex&page=1' -o "$TMP" \
     && [ "$(jq '.data|length' "$TMP")" -gt 5 ]; then ok=1; break; fi
  sleep $((i*5))
done
if [ "$ok" = 1 ]; then
  jq --arg t "$(date -u +%FT%TZ)" '{generatedAt:$t, data:.data, included:.included}' "$TMP" > site/data/trending.json.tmp && mv site/data/trending.json.tmp site/data/trending.json
else
  echo "trending fetch failed $(date -u +%FT%TZ), keeping previous snapshot" >>.cache/refresh.log
fi
rm -f "$TMP"
SURGE_LOGIN="$(jq -r .email /home/box/secrets/surge.json)" SURGE_TOKEN="$(jq -r .token /home/box/secrets/surge.json)" npx --yes surge@0.53.0 /workspace/ghostscreener/site ghostscreener.surge.sh >>.cache/refresh.log 2>&1
echo "refreshed + deployed $(date -u +%FT%TZ) (snapshot ok=$ok)"
