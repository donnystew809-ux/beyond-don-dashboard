<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Do not add `app/(dashboard)/loading.tsx`

It has been added twice and reverted twice. In this Next build a loading
boundary at the dashboard segment root leaves **page-level client components
unhydrated**: the shell (sidebar, bottom nav, header) hydrates normally, so the
app looks fine, but every island inside the page renders dead — no `onClick`,
no `onChange`, no React fiber. Buttons and inputs silently do nothing.

Measured on a production build of `/checkins`:

| | with `loading.tsx` | without |
|---|---|---|
| shell buttons hydrated | 8/12 | 12/12 |
| page inputs hydrated | **0/4** | **4/4** |

Verifying only that "some buttons hydrate" is how this slipped through the
second time — the shell always hydrates. Check an island **inside the page**:

```js
const has = el => Object.keys(el).some(k => k.startsWith('__reactFiber$'));
[...document.querySelectorAll('input')].filter(has).length
```

`router.prefetch()` in the nav and `experimental.staleTimes` are unaffected and
stay. If instant navigation is revisited, use `<Suspense>` boundaries inside
pages (see `node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md`)
and re-run the hydration check above on a production build before shipping.
