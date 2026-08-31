# NexPlay vendored browser assets

These browser assets are copied from the exact packages pinned in the root
`package.json` and are served locally by the desktop and hosted web editions.

- `@fontsource/outfit` 5.3.0
- `@fontsource/space-mono` 5.3.0
- `chart.js` 4.5.1
- `lucide` 1.25.0

The corresponding upstream license texts are stored in `vendor/licenses/`.
Refresh this directory only as part of an intentional dependency upgrade, then
run `npm run build:web-site` and `npm run verify:web-site`.
