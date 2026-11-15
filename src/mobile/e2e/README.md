# Tests de bout en bout (iOS)

Parcours Maestro contre un faux serveur DMZ, sur simulateur iOS.

- `mock-dmz/server.mjs` : imite `mobile-upload-pwa` (mêmes routes, en-têtes et formats) : code court, enrôlement, session, heartbeat, upload multipart, événements Socket.IO `file_status`. `GET /__e2e/state` donne ce que l'app a envoyé, `POST /__e2e/reset` remet le serveur à zéro.
- `maestro/upload-shared-file.yaml` (tag `ci`) : enrôlement par code, puis envoi d'un fichier comme s'il avait été partagé vers l'app, puis suivi du pipeline jusqu'à la disparition de la ligne. C'est le parcours joué en CI, sans micro.
- `maestro/enroll-record-upload.yaml` (tag `microphone`) : même chose avec un vrai enregistrement. Il faut un micro fonctionnel dans le simulateur, donc local uniquement.
- `maestro/subflows/` : étapes communes.

## Build E2E

Deux variables sont remplacées dans le bundle au moment de la construction (plugin Babel). Les builds de production ne les définissent pas.

- `MIRAI_API_URL=http://localhost:4010` : l'app parle au faux serveur.
- `MIRAI_E2E=1` : contournements propres au simulateur (`src/e2e.ts`). Les sons de début et de fin sont coupés, car leur lecture fait planter l'app sur un simulateur sans sortie audio. Le lien `fr-gouv-assistant-transcripts://e2e-ingest?path=…` met en file un fichier de l'hôte.

L'app doit être **signée ad hoc** (`CODE_SIGN_IDENTITY=-`), pas seulement compilée sans signature. Sinon elle n'a pas les droits Keychain et l'enrôlement échoue (« required entitlement isn't present »).

## En local

```bash
cd src/mobile
e2e/prepare-fixture.sh                               # /tmp/mirai-e2e/reunion-e2e.m4a
node e2e/mock-dmz/server.mjs &                       # http://localhost:4010, code E2E123
cd ios && MIRAI_E2E=1 MIRAI_API_URL=http://localhost:4010 xcodebuild \
  -workspace AssistantTranscripts.xcworkspace -scheme AssistantTranscripts \
  -configuration Release -sdk iphonesimulator -derivedDataPath build \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= build && cd ..
xcrun simctl install booted ios/build/Build/Products/Release-iphonesimulator/*.app
maestro test e2e/maestro --include-tags ci            # ou sans filtre, si le micro du simulateur marche
curl -s localhost:4010/__e2e/state
```

## En CI

Le workflow `mirai-mobile-ios.yml` a deux jobs. Le premier construit l'app E2E (environ 35 min). Le second (environ 10 min) démarre le faux serveur, installe l'app, joue les parcours `ci` puis vérifie l'état du serveur : au moins un enrôlement, au moins un upload, et pas de boucle d'appels à `/session`. En cas d'échec aléatoire, `gh run rerun <id> --failed` relance l'e2e sans reconstruire. Captures, journaux Maestro, journal de l'app et journal du faux serveur sont conservés en artefacts.
