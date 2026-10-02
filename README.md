# CareLink SCD Ghana

CareLink is a Next.js application for SCD screening and care-management workflows.

## Cloudflare deployment

This project uses the Cloudflare OpenNext adapter and deploys as a Cloudflare Worker.
Cloudflare currently recommends Workers for full-stack Next.js applications.

### Requirements

- Node.js 20.9+
- npm
- A Cloudflare account
- Wrangler authentication (`npx wrangler login`)

### Local development

```bash
npm install
npm run dev
```

### Test the Cloudflare build locally

```bash
npm run cf:preview
```

### Deploy

```bash
npx wrangler login
npm run cf:deploy
```

The application currently uses mock dashboard data. The Prisma seed file is retained as a reference for the future database layer, but Prisma is intentionally not part of the current deployment build because no Prisma schema/database adapter is present in this repository.
