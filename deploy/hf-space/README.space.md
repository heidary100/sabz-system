---
title: Sabz Demo API
emoji: 🌿
colorFrom: green
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

Sabz System API for the cloud demo (SS-247). Serves the demo storefront
(Vercel) and admin CMS (Cloudflare Pages) plus product media baked into this
image. Database: Neon Postgres. Redis: ephemeral, in-container. See
`docs/07-development/cloud-demo-deploy.md` in the sabz-system repo.
