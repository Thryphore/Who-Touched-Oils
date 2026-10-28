# Who Touched Oils

Web tool that parses a Deimos ArcDPS `.zevtc` / `.evtc` log in your browser and shows:

1. **First to touch each oil**
2. **Total oil hits** per player (skips downed/dead)

Same rules as the Blish HUD addon.

- **Live site:** https://thryphore.github.io/Who-Touched-Oils/
- **Blish addon repo:** https://github.com/Thryphore/Who-Touched-Oils-Blish

## Blish addon link

Edit `app.js` and set:

```js
const BLISH_ADDON_URL = "https://YOUR-BLISH-ADDON-LINK-HERE";
```

## Local preview

Open `index.html`, or:

```powershell
npx --yes serve .
```
