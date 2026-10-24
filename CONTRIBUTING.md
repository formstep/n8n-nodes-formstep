# Contributing

## Develop

```bash
npm ci
npm test
npm run build
npm run lint
```

The Formstep node lives in `nodes/Formstep/`: `Formstep.node.ts` wires the node together, `actions/` holds its parameters (`RequestDescription.ts`), what each operation calls (`RequestOperations.ts`) and how Create builds its body for a published or a new form (`RequestCreate.ts`), `FormFields.ts` maps `fields.list` onto the Fields mapper, and `FormstepMethods.ts` holds the pickers both nodes share. `FormstepTrigger.node.ts` registers, checks and removes the webhook subscription and verifies each delivery.

The node has three versions. Version 1 keeps a form dropdown and key/value Prefill and Context lists, version 2 adds the resource locators and the Fields mapper, and version 3, the default, adds **Simplify** to Get and Get Many. A parameter shown for one version only uses `@version` in its display options; code that behaves differently by version reads `context.getNode().typeVersion`. Never change what a saved version returns.

`npm test` runs unit tests, lifecycle tests that drive both nodes against an in-process Formstep API over real HTTP (`test/fakeFormstep.mts`), and checks on every workflow in `examples/`. `npm run dev` starts n8n with the node loaded and rebuilds on changes. Compiled package files are written to `dist/`. Run `npm pack --dry-run` to inspect what a release ships.

n8n's verification scanner ignores `eslint-disable` comments. Before a release, run it the way it runs:

```bash
./node_modules/.bin/eslint --no-inline-config credentials nodes
```

## Run locally against Formstep

The credential's server URL is a hidden field fixed to `https://api.formstep.io/api/v1` (`FORMSTEP_API_RESOURCE_URL` in `nodes/Formstep/constants.ts`). A local build therefore always talks to production Formstep: requests, webhook subscriptions and test submissions it creates are real data in the workspace you connect. Use a workspace meant for testing, and Test Mode on Create.

n8n on `http://localhost:5678` is enough to connect the credential, but Formstep cannot reach `localhost`, so a published **Formstep Trigger** never runs and a **Wait for the Outcome** callback never arrives. Three n8n settings fix this:

- `WEBHOOK_URL`: the public address n8n puts into the webhook and resume URLs it generates. The trigger sends its webhook URL to Formstep when the workflow is published (`webhooks.create`), and **Wait for the Outcome** sends `{{ $execution.resumeUrl }}` as the request's callback. Point it at a tunnel to `localhost:5678`, with a trailing `/`.
- `N8N_EDITOR_BASE_URL`: the address n8n builds a trigger's test URL for **Execute step** from, and the OAuth callback URL. Set it to the same tunnel address. Left at `http://localhost:5678/`, the trigger stops with "Formstep sends events to HTTPS addresses only". The OAuth callback also works on `http://localhost:5678/`, if you open n8n there.
- `N8N_PROXY_HOPS=1`, so n8n reads the tunnel's forwarded headers.

```bash
cloudflared tunnel --url http://localhost:5678   # prints https://<random>.trycloudflare.com

# in a second terminal
WEBHOOK_URL=https://<random>.trycloudflare.com/ \
N8N_EDITOR_BASE_URL=https://<random>.trycloudflare.com/ \
N8N_PROXY_HOPS=1 \
npm run dev
```

Open n8n through the address `N8N_EDITOR_BASE_URL` names from then on: the OAuth callback lands there, and it needs the n8n login cookie of that address.

To test the way users install the package, run n8n in Docker instead, install `n8n-nodes-formstep` from **Settings › Community Nodes**, and copy a local build over it:

```bash
docker run -d --name n8n-dev -p 5678:5678 \
  -e WEBHOOK_URL=https://<random>.trycloudflare.com/ \
  -e N8N_EDITOR_BASE_URL=https://<random>.trycloudflare.com/ \
  -e N8N_PROXY_HOPS=1 \
  -e N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true \
  -v n8n_dev:/home/node/.n8n docker.n8n.io/n8nio/n8n

npm run build
docker cp dist/. n8n-dev:/home/node/.n8n/nodes/node_modules/n8n-nodes-formstep/dist/
docker restart n8n-dev
```

A quick tunnel gets a new address every time `cloudflared` restarts. After a restart, update `WEBHOOK_URL` (recreate the container), and unpublish and publish each workflow again so the trigger registers its new webhook URL with Formstep.

## Release

The Publish workflow is the only way a version reaches npm. It publishes with provenance through npm trusted publishing when a `v*.*.*` tag is pushed.

1. Bump `version` in `package.json` and `package-lock.json`, and the version `test/Formstep.test.mts` expects. Add a `CHANGELOG.md` entry.
2. Run `npm test`, `npm run build`, `npm run lint` and the scanner command above.
3. Commit and push `main`.
4. Tag the commit with the same version and push the tag: `git tag v0.13.0 && git push origin v0.13.0`.

Do not run `npm publish` or `npm stage publish` by hand. npm keeps one version slot per version, so a hand-published or staged version makes the tag's publish fail with E409 "Cannot publish over previously staged version". The workflow fails if the tag does not match `package.json`, and skips publishing when the version is already on npm.
