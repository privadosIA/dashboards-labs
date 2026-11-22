# Contributing to dashboards-lab

## Maintenance

This repository is maintained by one person in their free time. Issues and pull requests are welcome and are read, but there is no promised response time, and some will not be answered. A repository that has not changed for a long time is not abandoned: it is finished or waiting.

## Issues

- Search the existing issues first, and open one issue per problem.
- Say the version (the commit), the browser, and whether you used the simulated API or a real server (and its version).
- A problem that cannot be repeated is closed after a reasonable wait.

## Pull requests

- Keep them small and about one thing. For anything big (a new screen, a new library, a rewrite) open an issue first, so the work is not lost.
- The tests must pass: `npm test`.
- No formatting-only changes in files you are not touching.
- By sending a pull request you agree that your work is under the licence of this repository (Apache-2.0). There is no CLA.

## What is probably not accepted

- Dependencies on paid services.
- Anything that sends the user's data out without being asked for.
- Changes to `contract/openapi.yaml` by hand: it is a copy of the server's contract and is refreshed from the server (`npm run contract:sync`, if you have one running).

## What is not here

This repository contains no server code. The server is [`mediaOrquestator`](https://github.com/privadosIA/mediaOrquestator); a change to the API belongs there.

## Security

Do not report a vulnerability in a public issue: see [SECURITY.md](SECURITY.md).

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
