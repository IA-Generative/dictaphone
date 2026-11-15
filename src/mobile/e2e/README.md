# Tests de bout en bout (iOS)

Parcours Maestro contre un faux serveur DMZ, sur simulateur iOS.

- `mock-dmz/server.mjs` : imite `mobile-upload-pwa` (mêmes routes, en-têtes et formats) : code court, enrôlement, session, heartbeat, upload multipart, événements Socket.IO `file_status`. Il expose aussi `GET /__e2e/state` pour vérifier ce que l'app a envoyé.
- `maestro/*.yaml` : les parcours. Les libellés sont ceux de l'interface en anglais, la langue par défaut du simulateur.

## En local

```bash
cd src/mobile
node e2e/mock-dmz/server.mjs &                      # http://localhost:4010, code E2E123
MIRAI_API_URL=http://localhost:4010 yarn start --reset-cache
yarn ios                                            # dans un autre terminal
maestro test e2e/maestro
curl -s localhost:4010/__e2e/state                  # uploads reçus
```

`MIRAI_API_URL` est remplacé dans le bundle au moment de la construction (plugin Babel) : il faut relancer Metro avec `--reset-cache` à chaque changement. Sans cette variable, l'app vise la DMZ de production.

## En CI

Le workflow `mirai-mobile-ios.yml` construit l'app (Release simulateur, `MIRAI_API_URL=http://localhost:4010`), démarre le faux serveur, installe l'app sur un simulateur, lance Maestro, puis vérifie qu'au moins un upload est arrivé. Captures d'écran et logs sont conservés en artefacts.
