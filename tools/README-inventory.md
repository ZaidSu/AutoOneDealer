# Sending the website's inventory to AutoDash

Why: the dealership website (hosted by CarsForSale) turns away requests from cloud servers like Vercel, and even from plain
scripts. A real browser gets in. These tools use a real browser, or curl, from a normal computer, and send the pages to AutoDash.

First: put a secret (30+ random characters) in Vercel as `INVENTORY_PUSH_TOKEN` and redeploy.

Try these in order. Stop at the first one that works.

1. `node tools/push-inventory.mjs`
   (set `$env:AUTODASH_URL = "https://auto-one-dealer.vercel.app"` and `$env:INVENTORY_PUSH_TOKEN = "..."` first)
   Uses Node, and curl.exe if Node is refused.

2. A real invisible Chrome (needs Google Chrome on the computer):
       cd tools
       npm install
       node push-inventory-browser.mjs
   If it fails, run it again with `$env:SHOW_BROWSER = "1"` to watch it. Edge instead of Chrome: `$env:BROWSER_CHANNEL = "msedge"`.

3. By hand, always works: open the website's cars-for-sale page in Chrome, press F12, open Console, paste all of
   `tools/browser-snippet.js`, press Enter, and type the token when asked. Takes about 15 seconds. Do this any time you want
   the inventory refreshed.

Making 1 or 2 automatic: on a dealership computer that stays on, schedule it every 15 minutes (Windows):
    setx AUTODASH_URL "https://auto-one-dealer.vercel.app"
    setx INVENTORY_PUSH_TOKEN "your secret"
    schtasks /Create /SC MINUTE /MO 15 /TN "AutoDash inventory" /TR "cmd /c cd /d C:\path\to\AutoOneDealer && node tools\push-inventory.mjs"
(For option 2 use `node tools\push-inventory-browser.mjs` instead.) The GitHub workflow (`.github/workflows/push-inventory.yml`)
runs option 1 from GitHub's servers, which the website probably turns away too.
