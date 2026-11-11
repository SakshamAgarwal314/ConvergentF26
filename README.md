# skindex

## Backend design

The proposed database schema, permission matrix, API contracts, and acceptance scenarios are in [docs/README.md](docs/README.md). These describe the first workflow from the [backend plan](SkinDex_Backend_Plan.md). The backend foundation is implemented; patient features are still planned.

## Current Capability

The [backend](backend/README.md) has a TypeScript/Fastify scaffold, validated environment configuration, development/build scripts, and `GET /health`. Run it with `cd backend`, `npm ci`, then `npm run dev`.

## Planned Capability

### User - User

Users are able to navigate through different prescriptions and advice given to them by their provider. 
They're able to maintain a streak as well. Weekly logs are uploaded to check in on a user's skin.

### Sudo - User

A prescriber is able to inject a certain medication and its tied `DAW Code` [input `0-9`].

Insurance is also able to verify and validate codes provided to the user.

## Deployment

there is nothing to deploy right now `:(`

## Host

idk vercel prob

## Security

unconfigured

## Other Notes

hi
