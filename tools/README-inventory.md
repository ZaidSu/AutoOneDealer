# Sending the website's inventory to AutoDash

Why: some websites (including the CarsForSale-hosted one) turn away requests that come from cloud servers like Vercel.
A normal computer isn't turned away. `push-inventory.mjs` reads the website from where it runs and sends the pages to AutoDash.

1. Make a secret: any random text, 30+ characters. Put it in Vercel (Settings > Environment Variables) as
   `INVENTORY_PUSH_TOKEN`, then redeploy.
2. Run it by hand to test (Node 18+), from the project folder (PowerShell):
       $env:AUTODASH_URL = "https://auto-one-dealer.vercel.app"
       $env:INVENTORY_PUSH_TOKEN = "your secret"
       node tools/push-inventory.mjs
   You should see "Sent to AutoDash: 83 cars".
3. Make it automatic, either way:
   - GitHub (free, no computer needed): the file `.github/workflows/push-inventory.yml` runs it every 15 minutes. Add the two
     secrets AUTODASH_URL and INVENTORY_PUSH_TOKEN in the repo's Settings > Secrets and variables > Actions, then open the
     Actions tab, pick "Send inventory to AutoDash" and click Run workflow once to test it.
   - A dealership computer that stays on: save the two settings once with
       setx AUTODASH_URL "https://auto-one-dealer.vercel.app"
       setx INVENTORY_PUSH_TOKEN "your secret"
     (then open a new window) and schedule it every 15 minutes:
       schtasks /Create /SC MINUTE /MO 15 /TN "AutoDash inventory" /TR "cmd /c cd /d C:\path\to\AutoOneDealer && node tools\push-inventory.mjs"
