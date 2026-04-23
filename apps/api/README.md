# @premura/api

Backend Fastify + BullMQ di Premura. Deploy su Fly.io (vedi `fly.toml`).

## Build + run locale (Docker)

Da repo ROOT (serve accedere a `packages/*` nel build context):

```bash
docker build -f apps/api/Dockerfile -t premura-api .
docker run --rm -p 8080:8080 --env-file .env.local premura-api
```
