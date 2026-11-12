# OpenMAIC in the Innotel Platform Stack

**Role: Course generation (internal)** — the classroom that turns a topic and
its materials into slides, narration and interactive pages.

## What it is

OpenMAIC (Multi-Agent Interactive Classroom) builds a course from a prompt: an
outline stage, scene-content stages for slides and interactive pages, and media
stages for images, video, narration and web research. The finished course plays
back as a classroom, and a teacher can edit it scene by scene.

## How it runs in the estate

- Models, speech and media reach the app through the estate's OmniRoute gateway
  on a single key. `openmaic.yml` names the gateway, so a workspace never holds
  a vendor key of its own.
- Classroom SSO and secrets follow the platform's env contract; the templates
  are `.env.classroom-sso.example` and `.env.classroom-secrets.example`.
- Storage runs locally in development and on PostgreSQL in the estate. The
  `Storage PostgreSQL Contract` workflow exercises the database path on every
  push.

## Where to look next

- `README.md` — setup, scripts, and the shape of the app.
- `.github/workflows/` — CI, the storage contract, and the package publishing
  workflows.
- `openmaic.example.yml` — the deployment configuration template.

## License

MIT — see `LICENSE`.
