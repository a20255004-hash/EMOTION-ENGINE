# Arquitectura de EMOTION ENGINE

## Principios

1. **Un único estado, un único canal de cambios.** Todo lo que modifica la escena —controles, intérprete local, IA, plantillas narrativas— produce *operaciones* del esquema `OperationSchema` (`shared/operations.ts`), que se validan y se aplican con `applyOperations`. Ningún componente externo ejecuta código ni escribe el estado directamente.
2. **Registro de parámetros como fuente de verdad.** `shared/params.ts` define cada parámetro (tipo, rango, grupo, descripción). De ahí salen el panel de propiedades, la validación, los destinos de audio, el vocabulario del intérprete y el contrato que recibe un modelo de IA.
3. **El motor no conoce la aplicación.** `src/engine/Engine.ts` recibe `(mundo, parámetros)` y una función de modulación; devuelve imágenes. No importa React ni el store.
4. **Integraciones opcionales y sustituibles.** El navegador solo consulta `/api/capabilities`. Las claves viven en el servidor; cada proveedor implementa una interfaz pequeña (`LlmProvider`, `MusicProvider`).

## Mapa de módulos

```
shared/                     ← compartido por cliente y servidor
  params.ts                 registro de parámetros visuales
  presets.ts                mundos (identidad visual) y estados de ánimo
  schema.ts                 esquemas zod: Project, SceneState, AudioBinding, StoryScene, Sequence, ExportSettings, ProjectVersion
  operations.ts             OperationSchema + applyOperations (validación, recorte, motivos de rechazo)
  aiContract.ts             prompt de sistema, descripción del estado, StoryPlanSchema
  projectFactory.ts         creación y reparación/migración de proyectos
  wav.ts                    codificador WAV

src/engine/                 ← motor visual (Three.js)
  Engine.ts                 renderizador, composición (MSAA → bloom → tone mapping → pase final), bucle, captura, calidad adaptativa
  CameraRig.ts              órbita / deriva / travesía / fija + control manual
  Particles.ts              partículas GPU con densidad por drawRange
  SkyDome.ts, glsl.ts       cielo procedural y ruido simplex/fbm
  worlds/                   10 mundos (interfaz World) + common.ts (paleta, envoltura infinita, azar determinista)
  post/FinalPass.ts         aberración, tono, saturación, viñeta, grano, fundidos
  host.ts                   une store ↔ motor y aplica la modulación de audio por fotograma

src/audio/                  ← Web Audio API
  AudioEngine.ts            reproducción, micrófono, analyser, destino de grabación
  analysis.ts               bandas, detector de pulsos, envolvente (puro, testeado)
  modulation.ts             parámetros efectivos = base + Σ vinculaciones (no toca el estado guardado)
  soundscape.ts             paisajes sonoros generativos por escenario (recetas Web Audio, fundido cruzado)
  demoTrack.ts, tracks.ts   pista sintetizada y gestión de pistas del proyecto

src/nlp/localInterpreter.ts ← reglas → operaciones + órdenes de app; devuelve también lo no reconocido
src/nlp/commands.ts         ← órdenes de aplicación (pausa, captura, sonido, navegación…)
src/nlp/surprise.ts         ← «Sorpréndeme»: combinación aleatoria de operaciones validadas
src/ui/actions.ts           ← acciones compartidas por botones, atajos y órdenes
src/story/                  ← secuencias: resolución temporal y transiciones, consistencia, plantillas, reproductor
src/export/                 ← grabación (MediaRecorder), descargas, paquete de proyecto
src/storage/                ← ProjectRepository (IndexedDB) + copia de recuperación síncrona
src/state/                  ← zustand: proyecto (historial, autoguardado) e interfaz
src/integrations/apiClient  ← cliente del backend con revalidación de lo recibido
src/ui/                     ← React: Stage, PromptBar, paneles Studio/Sound/Story/Export/Biblioteca

server/                     ← Express
  index.ts                  rutas, límites, tiempos de espera, validación de salida
  ai/                       AnthropicProvider (SDK oficial, salida estructurada), OpenAICompatibleProvider
  music/                    MockMusicProvider (prueba, no IA), HttpMusicProvider (genérico), cupo diario
```

## Flujo de un cambio

```
Deslizador ─┐
Intérprete ─┼─► Operation[] ─► applyOperations ─► projectStore.commit ─┬─► historial (deshacer)
IA (server) ┘     (zod)          (recorte/rechazo)                      ├─► autoguardado IndexedDB (700 ms) + copia localStorage
                                                                        └─► host.ts ─► engine.setScene()
Cada fotograma: engine ─► modulator(base) = base + audio·vinculaciones ─► mundo.update() ─► composer.render()
```

## Esquemas principales

- **Project**: `id, name, scene{world, params}, audio{settings, bindings[], tracks[], activeTrackId}, sequence{title, idea, scenes[], loop, consistency}, exportSettings, thumbnail, sync{ownerId, remoteId, revision, state}`.
- **AudioBinding**: `source ∈ {bass, lowMid, mid, high, volume, beat}`, `target ∈ AUDIO_TARGETS`, `amount ∈ [-1, 1]` (fracción del rango del parámetro), `enabled`.
- **StoryScene**: `name, description, duration, world, params, bindings?, audio{trackId, volume}, transition{type ∈ cut|fade|morph|flash, duration}`.
- **ProjectVersion**: instantánea completa del proyecto con etiqueta; las automáticas se podan (25).

## Puntos de extensión

| Quiero… | Dónde |
|---|---|
| Añadir un parámetro | `PARAM_DEFS` en `shared/params.ts` y usarlo en los mundos que lo interpreten. Aparece solo en UI, validación, IA y (si se añade a `AUDIO_TARGETS`) en vinculaciones. |
| Añadir un mundo | Clase que implemente `World` en `src/engine/worlds/`, registrarla en `WORLD_FACTORY` (Engine.ts), `WORLD_IDS` y `WORLDS`/preset en `shared/presets.ts`. |
| Otro proveedor de IA | Implementar `LlmProvider.generateStructured` y añadirlo en `server/ai/index.ts`. |
| Otro proveedor de música | Implementar `MusicProvider` en `server/music/`. |
| Cuentas y nube | Implementar `ProjectRepository` remoto (mismo contrato) usando `project.sync` para revisiones y conflictos; mantener IndexedDB como caché offline. |
| Vídeo por IA | Nueva ruta `/api/video/*` con adaptador y trabajo asíncrono (sondeo); activar la tarjeta en Export (`capabilities.video`). |

## Experiencia web compartible (fase posterior)

El paquete `emotion-engine/project` (exportado desde Export Studio) contiene todo lo necesario para reproducir una experiencia: mundo, parámetros, vinculaciones y secuencia. El plan:

1. Un punto de entrada `player.html` que importa solo `src/engine`, `src/audio` y `src/story/sequence.ts` (sin React ni editor) y recibe el JSON por URL o incrustado.
2. Publicación: subir JSON + pistas a almacenamiento remoto y servir el reproductor estático con un identificador corto.
3. Las pistas de audio requieren almacenamiento con derechos de uso; por eso el JSON actual no las incluye.

## Exportación de alta resolución

La captura re-renderiza a `scale ×` la resolución del escenario hasta el límite de la GPU (`MAX_RENDERBUFFER_SIZE`, tope de 8192 px y 36 MP). La grabación es en tiempo real (MediaRecorder): si el equipo no sostiene los fps elegidos, el vídeo los pierde. Un render 4K/8K sin pérdidas requeriría un modo determinista (tiempo fijo por fotograma, captura fotograma a fotograma con WebCodecs y multiplexado), previsto como fase posterior.
