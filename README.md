# EMOTION ENGINE · Studio

Estudio audiovisual generativo e interactivo que funciona en el navegador. Transforma ideas, música e historias en experiencias 3D renderizadas en tiempo real (Three.js), que se pueden explorar, modificar con controles o con lenguaje natural, sincronizar con audio, organizar en secuencias narrativas, guardar y exportar.

> No usa vídeos pregrabados: cada fotograma se genera en la GPU del usuario.

## Puesta en marcha

Requisitos: Node.js ≥ 20.12 y un navegador con WebGL 2 (Chrome, Edge, Firefox o Safari recientes).

```bash
npm install
npm run dev          # web en http://localhost:5173 + API de integraciones en :8787
```

Producción:

```bash
npm run build
npm start            # sirve dist/ y la API en http://localhost:8787
```

La API es opcional: si no está en ejecución, el editor funciona entero en modo local y lo indica en la interfaz.

## Qué incluye (MVP + fase 2)

| Módulo | Funciones |
|---|---|
| **Experience Studio** | Tres mundos completos con identidad propia: *Océano onírico* (oleaje en GPU, Fresnel, bioluminiscencia, orbes y anillo-portal), *Universo abstracto* (núcleo deformado por ruido, anillos de poliedros instanciados, galaxia espiral, nebulosa) y *Paisaje atmosférico* (relieve fractal infinito, cielo con sol, niebla de valle y bancos de niebla, polvo, aves). 31 parámetros editables en tiempo real (movimiento, forma, luz, paleta, partículas, atmósfera/profundidad, cámara, intensidad visual). Pausa, reinicio, captura, pantalla completa, 4 modos de cámara + control manual, atajos de teclado, deshacer/rehacer, calidad adaptativa. |
| **Editor por lenguaje natural** | Intérprete local por reglas (sin red) que convierte instrucciones en operaciones validadas, muestra los cambios exactos (antes → después), avisa de lo que no entiende y permite deshacer. Capa opcional de IA: el modelo solo puede devolver operaciones del mismo esquema, que se validan en el servidor y otra vez en el cliente. |
| **Sound Lab** | Importación de audio (MP3/WAV/OGG/FLAC/M4A/WebM), pista de demostración sintetizada en el navegador, micrófono, transporte, espectro y medidores en vivo, estimación de tempo, sensibilidad/suavizado/intensidad/ataque/liberación, vinculaciones banda → parámetro activables individual o globalmente. Adaptador opcional de generación musical en el servidor (límites, cupo, tiempos de espera, coste estimado). |
| **Story Worlds** | Escenas con nombre, descripción, duración, mundo, parámetros, audio y transición (corte, fundido, morph, destello). Añadir, duplicar, eliminar y reordenar (arrastrar o botones). Línea de tiempo con reproducción, búsqueda y bucle. Generación local desde una idea y plantillas; opción IA. Consistencia entre escenas por grupos. |
| **Export Studio** | Captura re-renderizada hasta 4× (PNG/JPEG/WebP, límite real de la GPU), grabación de la experiencia en tiempo real con audio (MP4 o WebM según el navegador; escena en vivo o secuencia completa; resolución, fps y bitrate), progreso y vista previa del archivo. Exportación del proyecto en JSON. El vídeo por IA aparece separado y marcado como no disponible. |
| **Biblioteca** | Crear, nombrar, abrir, duplicar, eliminar (con confirmación), importar JSON. Autoguardado con estado visible, copia de recuperación ante recargas/cierres, versiones manuales y automáticas con restauración. |

## Configurar integraciones opcionales

Copia `.env.example` a `.env` (nunca se envía al navegador):

```ini
# IA para el editor y Story Worlds
AI_PROVIDER=anthropic            # o openai-compatible / none
ANTHROPIC_API_KEY=...
AI_MODEL=claude-opus-5-5
AI_EFFORT=low                    # baja latencia para edición interactiva

# Cualquier API compatible con OpenAI (OpenAI, OpenRouter, Ollama, LM Studio…)
# AI_PROVIDER=openai-compatible
# OPENAI_COMPAT_BASE_URL=http://localhost:11434/v1
# OPENAI_COMPAT_MODEL=llama3.1

# Música
MUSIC_PROVIDER=mock              # mock = sintetizador de PRUEBA (no es IA) · http = adaptador genérico
MUSIC_API_URL=https://…          # http: POST {prompt, duration_seconds} → audio/* o JSON {audio_url|audio_base64}
MUSIC_API_KEY=...
MUSIC_MAX_DURATION_SEC=30
MUSIC_DAILY_LIMIT=20
MUSIC_COST_PER_SEC_USD=0.002     # solo informativo, se muestra antes de generar
```

Con el proveedor Anthropic se usa el SDK oficial con salida estructurada (esquema zod), reintento en el servidor con modelo alternativo si el principal declina (`fallbacks: "default"`), y manejo tipado de errores (clave inválida, límite de tasa, tiempo de espera, conexión). Los fallos del proveedor de música no consumen cupo.

## Verificación

```bash
npm run typecheck      # TypeScript estricto (cliente, servidor y pruebas)
npm test               # 46 pruebas unitarias: operaciones, intérprete, análisis de audio, modulación, secuencias, almacenamiento, contrato IA, servidor
npm run test:e2e       # Playwright sobre la build de producción + API
npm run build && npm run check:secrets   # sin claves en el cliente ni en respuestas/errores/registros
```

Las pruebas end-to-end comprueban en un navegador real: que los tres mundos se renderizan con imágenes distintas y sin errores de consola; que los controles cambian los parámetros del motor y la imagen; pausa/reanudación/reinicio; cámara y pantalla completa; las cuatro instrucciones de ejemplo y el aviso de lo no reconocido; importación, reproducción y análisis de un WAV (graves y pulsos detectados); que una vinculación modula la escena sin alterar el valor guardado y que se desactiva; pista de demostración y generación con el proveedor de prueba; rechazo de archivos inválidos; guardado y recuperación tras recarga (incluida una recarga inmediata); biblioteca con confirmación de borrado; versiones; exportación/importación JSON; Story (plantilla, edición, reordenación, reproducción, generador local, consistencia); captura a 2× con resolución real; grabación con pista de audio; distinción captura/grabación/vídeo IA; móvil y tableta sin desbordamiento; funcionamiento sin servidor y sin WebGL.

## Límites conocidos

- **Rendimiento**: depende de la GPU. La calidad adaptativa reduce la resolución interna si los fps caen de forma sostenida. En entornos sin GPU (renderizado por software) funciona, pero lento.
- **Grabación**: es en tiempo real; si el equipo no sostiene los fps, el vídeo tampoco. Safari graba MP4; Chrome/Firefox WebM (Chrome reciente también MP4). Sin `MediaRecorder` se ofrece la captura de imagen.
- **Alta resolución offline (4K/8K sin pérdidas)**: requiere un render determinista fotograma a fotograma; alternativa actual: captura hasta el límite de la GPU y grabación 1080p.
- **Intérprete local**: vocabulario acotado (ver «¿Qué entiende?» en la interfaz). Para instrucciones abiertas, el modo IA.
- **Generación musical**: el repositorio incluye un proveedor de *prueba* y un adaptador HTTP genérico; no se ha verificado contra un proveedor comercial concreto porque requiere credenciales.
- **Vídeo por IA, cuentas, sincronización y experiencias compartibles**: fases posteriores (ver `docs/ARCHITECTURE.md`); la interfaz no ofrece botones para ellas.
- El proyecto JSON no incluye las pistas de audio (pueden tener derechos de uso); se reimportan en Sound Lab.

## Plan de desarrollo

1. **MVP (hecho)**: motor 3D, tres experiencias, controles reales, análisis de audio y vinculaciones, intérprete local, proyectos con autoguardado, captura.
2. **Fase 2 (hecho)**: secuencias narrativas, grabación audiovisual, versiones, adaptadores IA/música opcionales.
3. **Fase 3**: proveedor musical comercial verificado, vídeo por IA asíncrono, render determinista de alta resolución.
4. **Fase 4**: cuentas, almacenamiento remoto con sincronización (`ProjectRepository` remoto + `project.sync`) y reproductor web compartible.

Arquitectura detallada: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
