# Infrastructure (placeholder)

GCP and Firebase configuration. Nothing here is deployed yet.

| Folder | Story | Contents to add |
|---|---|---|
| `cloud-run/` | BE-38 (Shreya) | Cloud Run service config for the backend: region `asia-south1`, `min-instances=1`, `max-instances=1`, instance-based billing, session affinity on, request timeout 3600s, concurrency 200. The JWT key comes from Secret Manager. |
| `firebase-hosting/` | FE-04 (Shreya) | One Firebase Hosting site serving `frontend/build/web`, with rewrites so `/controller`, `/audience` and `/player` open directly. `Cache-Control: no-cache` on `index.html`, `flutter_bootstrap.js`, `main.dart.js` and `*.part.js`: deferred imports rule out content-hashed names. Long cache only for files whose names never change content. |
| `storage/` | BE-38, BE-35 (Shreya) | Private Cloud Storage bucket with uniform access and CORS for the app origin. Treasure images go under `events/{eventId}/treasures/`. |

Service account roles (BE-38): Firestore, Storage, Vertex AI User, and Service Account Token Creator on itself (needed to sign image URLs). No key files go in the repo.
