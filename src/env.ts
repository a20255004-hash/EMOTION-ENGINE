/**
 * Modo «vista previa incrustada»: la build que se publica dentro de un marco
 * restringido (sin descargas, sin micrófono, sin servidor de integraciones).
 * Se activa con VITE_EMBEDDED=1 al compilar.
 */
export const EMBEDDED = import.meta.env.VITE_EMBEDDED === '1';

export const EMBEDDED_LIMITS =
  'Vista previa en línea: este marco bloquea las descargas y el micrófono. Captura, grabación y exportación muestran el resultado aquí, pero para guardar archivos ejecuta la app en tu equipo o en su web.';
