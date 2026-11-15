# Tests de bout en bout (iOS)

Parcours Maestro contre un faux serveur DMZ, sur simulateur iOS.

- `mock-dmz/server.mjs` : imite `mobile-upload-pwa` (mêmes routes, en-têtes et formats) : code court, enrôlement, session, heartbeat, upload multipart, événements Socket.IO `file_status`. `GET /__e2e/state` donne ce que l'app a envoyé, `POST /__e2e/reset` remet le serveur à zéro.
  Parcours (`maestro/`). Chacun commence par remettre à zéro le faux serveur et lui donner son scénario :

| Parcours                    | Tag            | Vérifie                                                                                                                                                                                                                            |
| --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upload-shared-file.yaml`   | `ci`           | enrôlement par code, fichier partagé vers l'app, pipeline complet, puis disparition de la ligne                                                                                                                                    |
| `error-upload-401.yaml`     | `ci`, `errors` | upload refusé en 401 : ligne bloquée avec le message du serveur, puis Réessayer et envoi terminé                                                                                                                                   |
| `error-upload-429.yaml`     | `ci`, `errors` | 429 avec Retry-After : alerte, « Envois en pause », fichier conservé, puis reprise automatique à l'échéance                                                                                                                        |
| `error-virus.yaml`          | `ci`, `errors` | virus détecté par la DMZ : ligne bloquée avec le message, puis suppression confirmée                                                                                                                                               |
| `enroll-record-upload.yaml` | `microphone`   | même chose avec un vrai enregistrement ; il faut un micro dans le simulateur, donc local uniquement                                                                                                                                |
| `crash-recovery.yaml`       | `microphone`   | app tuée en plein enregistrement : au relancement, les segments déjà écrits sont recollés, la fenêtre « Récupération » s'affiche, et le fichier récupéré (au moins 300 Ko, soit un segment d'environ 30 s) est reçu par le serveur |

`maestro/subflows/` contient les étapes communes (enrôlement, partage de fichier, suivi du pipeline). `maestro/scripts/set-scenario.js` pilote le faux serveur : `POST /__e2e/scenario`, par exemple `{"uploadFailures":1,"uploadStatus":401,"uploadError":"…"}`, `{"retryAfter":20}` ou `{"pipeline":"infected"}`.

Sur un écran immobile, Maestro 2.11 abrège les attentes (`extendedWaitUntil` rend la main au bout d'environ une seconde). Pour attendre une disparition, les parcours interrogent donc l'écran en boucle (`repeat` / `while`).

## Build E2E

Deux variables sont remplacées dans le bundle au moment de la construction (plugin Babel). Les builds de production ne les définissent pas.

- `MIRAI_API_URL=http://localhost:4010` : l'app parle au faux serveur.
- `MIRAI_E2E=1` : contournements propres au simulateur (`src/e2e.ts`). Les sons de début et de fin sont coupés, car leur lecture fait planter l'app sur un simulateur sans sortie audio. Le lien `fr-gouv-assistant-transcripts://e2e-ingest?path=…` met en file un fichier de l'hôte.

L'app doit être **signée ad hoc** (`CODE_SIGN_IDENTITY=-`), pas seulement compilée sans signature. Sinon elle n'a pas les droits Keychain et l'enrôlement échoue (« required entitlement isn't present »).

## En local

```bash
cd src/mobile
yarn e2e:ios                        # tous les parcours (micro compris)
yarn e2e:ios --include-tags ci      # ceux de la CI
E2E_FULL_BUILD=1 yarn e2e:ios       # forcer un build natif complet
```

Le script `e2e/run-local.sh` s'occupe de tout : build si besoin, simulateur, installation, fichiers de test, faux serveur, Maestro.

- Le premier lancement fait un build natif complet : environ 8 min sur un MacBook Pro, tests compris.
- Ensuite, tant que `ios/`, `package.json` et `yarn.lock` ne changent pas, seul le bundle JS est reconstruit (`e2e/rebundle-app.sh`, environ 30 s). Un lancement complet prend alors environ 3 min.

Prérequis : Xcode, Ruby 3.2 ou plus avec bundler (CocoaPods), Java 17 ou plus, et Maestro (`maestro` dans le `PATH` ou `MAESTRO_BIN`). Pour le parcours micro, il faut aussi autoriser Simulator dans Réglages Système → Confidentialité → Microphone.

## En CI

Le workflow `mirai-mobile-ios.yml` a deux jobs. Le premier construit l'app E2E : build natif arm64 mis en cache selon `ios/`, `package.json` et `yarn.lock`. Si ces fichiers n'ont pas changé, seul le bundle JS est reconstruit (quelques minutes). Sinon, il faut compter un build complet d'environ 20 à 30 min. Le second (environ 10 min) démarre le faux serveur, installe l'app, joue les parcours `ci` puis vérifie l'état du serveur : au moins un enrôlement, au moins un upload, et pas de boucle d'appels à `/session`. En cas d'échec aléatoire, `gh run rerun <id> --failed` relance l'e2e sans reconstruire. Captures, journaux Maestro, journal de l'app et journal du faux serveur sont conservés en artefacts.
