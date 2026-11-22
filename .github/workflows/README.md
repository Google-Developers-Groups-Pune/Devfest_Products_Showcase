# CI/CD workflows (placeholder)

GitHub Actions workflow files (`*.yml`) go in this folder. Owners and requirements from `docs/`:

| Workflow | Story | Must do |
|---|---|---|
| Backend CI | BE-01 (Shreya) | On every PR: `npm run lint`, `npm run typecheck`, `npm run test:emulator` in `backend/`. The Firestore emulator needs a JDK on the runner; use 21+, since Firebase has announced the emulator will require it. A failing test blocks the PR. |
| Backend deploy | BE-38 (Shreya) | Merging to `main` deploys dev to Cloud Run. Prod deploys only after manual approval. |
| Frontend CI and hosting | FE-04 (Shreya) | `flutter analyze`, `flutter test`, `flutter build web --release --no-web-resources-cdn` with the production flavour. Deploys to Firebase Hosting on merge to `main`. Records the release bundle size. |
| Contract | BE-02 (Shravani) | `npm run lint` in `contract/`. Regenerate the Dart client when the OpenAPI file changes. |
