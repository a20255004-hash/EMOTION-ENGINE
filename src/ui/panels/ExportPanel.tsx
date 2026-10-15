import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExportSettings } from '../../../shared/schema';
import { audioEngine } from '../../audio/AudioEngine';
import { getEngine } from '../../engine/host';
import { downloadBlob, formatBytes, formatTime, projectPackage, safeFileName, timestamp } from '../../export/files';
import { RESOLUTIONS, recorderSupport, startRecording, type RecordingHandle, type RecordingResult } from '../../export/recorder';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { storyPlayer } from '../../story/player';
import { totalDuration } from '../../story/sequence';
import { Notice, Section, Segmented, Select, Slider, Toggle } from '../components/controls';
import { Icon } from '../components/Icon';

interface CaptureInfo {
  url: string;
  blob: Blob;
  width: number;
  height: number;
  clamped: boolean;
  requested: string;
  name: string;
}

function ImageExport() {
  const settings = useProjectStore((s) => s.project!.exportSettings.image);
  const name = useProjectStore((s) => s.project!.name);
  const { updateExportSettings } = useProjectStore.getState();
  const stats = useUiStore((s) => s.stats);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CaptureInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);
  const engine = getEngine();
  const max = engine?.maxCaptureSize() ?? 4096;
  const stage = engine ? { w: engine.canvas.clientWidth, h: engine.canvas.clientHeight } : { w: 0, h: 0 };

  const capture = async () => {
    const e = getEngine();
    if (!e) return;
    setBusy(true);
    setError(null);
    try {
      const r = await e.capture({ scale: settings.scale, format: settings.format, quality: settings.quality });
      const ext = settings.format === 'jpeg' ? 'jpg' : settings.format;
      const fname = `${safeFileName(name)}-${timestamp()}.${ext}`;
      setResult({ url: URL.createObjectURL(r.blob), blob: r.blob, width: r.width, height: r.height, clamped: r.clamped, requested: `${r.requestedWidth}×${r.requestedHeight}`, name: fname });
      downloadBlob(r.blob, fname);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo capturar');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <div className="export-kind">
        <span className="ico">
          <Icon name="image" />
        </span>
        <div>
          <h3 style={{ margin: 0 }}>Captura de imagen</h3>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            Re-renderiza el fotograma actual a mayor resolución (no es un reescalado). Límite de este dispositivo: {max}px por lado.
          </p>
        </div>
      </div>
      <Segmented<ExportSettings['image']['format']>
        label="Formato"
        value={settings.format}
        options={[
          { value: 'png', label: 'PNG' },
          { value: 'jpeg', label: 'JPEG' },
          { value: 'webp', label: 'WebP' },
        ]}
        onChange={(format) => updateExportSettings({ image: { format } })}
      />
      <Segmented<number>
        label="Escala"
        value={settings.scale}
        options={[
          { value: 1, label: '1×' },
          { value: 2, label: '2×' },
          { value: 3, label: '3×' },
          { value: 4, label: '4×' },
        ]}
        onChange={(scale) => updateExportSettings({ image: { scale } })}
      />
      {settings.format !== 'png' && <Slider label="Calidad" value={settings.quality} min={0.5} max={1} step={0.01} onChange={(quality) => updateExportSettings({ image: { quality } })} />}
      <p className="hint">
        Resultado previsto: {Math.round(stage.w * settings.scale)}×{Math.round(stage.h * settings.scale)} px{stats ? '' : ''}.
      </p>
      <button type="button" className="btn btn-primary" onClick={capture} disabled={busy || !engine} data-testid="export-image">
        {busy ? <span className="spinner" /> : <Icon name="camera" />} Capturar y descargar
      </button>
      {error && <Notice kind="error">{error}</Notice>}
      {result && (
        <div className="stack" data-testid="image-result">
          <img src={result.url} alt="Vista previa de la captura" className="result-preview" />
          <div className="result-file">
            <Icon name="check" />
            <div className="grow">
              <div>{result.name}</div>
              <div className="hint">
                {result.width}×{result.height} · {formatBytes(result.blob.size)}
                {result.clamped ? ` · reducido desde ${result.requested} por el límite de la GPU` : ''}
              </div>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => downloadBlob(result.blob, result.name)}>
              <Icon name="download" /> Descargar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VideoExport() {
  const settings = useProjectStore((s) => s.project!.exportSettings.video);
  const name = useProjectStore((s) => s.project!.name);
  const sceneCount = useProjectStore((s) => s.project!.sequence.scenes.length);
  const seqDuration = useProjectStore((s) => totalDuration(s.project!.sequence.scenes));
  const { updateExportSettings } = useProjectStore.getState();
  const support = useMemo(() => recorderSupport(), []);
  const [mimeIndex, setMimeIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [recording, setRecording] = useState(false);
  const [encoderReady, setEncoderReady] = useState(false);
  const [result, setResult] = useState<(RecordingResult & { url: string; name: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handleRef = useRef<RecordingHandle | null>(null);
  useEffect(() => () => void (result && URL.revokeObjectURL(result.url)), [result]);
  useEffect(() => () => handleRef.current?.stop(), []);

  if (!support.supported) {
    return (
      <Notice kind="warn">
        <strong>Grabación no disponible en este navegador.</strong> {support.reason} Alternativa: usa la captura de imagen, o graba con Chrome, Edge o Firefox de escritorio recientes.
      </Notice>
    );
  }
  const fmt = support.mimeTypes[Math.min(mimeIndex, support.mimeTypes.length - 1)];
  const useSequence = settings.source === 'sequence';
  const duration = useSequence ? seqDuration : settings.durationSec;
  const audioReady = !!audioEngine.recordingStream();
  const willHaveAudio = settings.includeAudio && audioReady;

  const start = async () => {
    const engine = getEngine();
    if (!engine) return;
    if (useSequence && sceneCount === 0) {
      setError('La secuencia no tiene escenas. Crea escenas en Story o graba la escena en vivo.');
      return;
    }
    setError(null);
    setResult(null);
    const vw = engine.canvas.clientWidth;
    const vh = engine.canvas.clientHeight;
    const size = RESOLUTIONS[settings.resolution].size(vw, vh);
    const max = engine.maxCaptureSize();
    const k = Math.min(1, max / Math.max(size.w, size.h));
    engine.setFixedSize({ w: Math.floor((size.w * k) / 2) * 2, h: Math.floor((size.h * k) / 2) * 2 });
    if (settings.includeAudio) audioEngine.ensure();
    useUiStore.getState().setRecording(true);
    setRecording(true);
    setEncoderReady(false);
    setElapsed(0);
    try {
      const handle = startRecording({
        canvas: engine.canvas,
        audio: settings.includeAudio ? audioEngine.recordingStream() : null,
        fps: settings.fps,
        bitrateMbps: settings.bitrateMbps,
        durationSec: useSequence ? null : settings.durationSec,
        mime: fmt.mime,
        ext: fmt.ext,
        onProgress: setElapsed,
        onStarted: () => {
          setEncoderReady(true);
          // La secuencia arranca cuando el codificador ya está grabando, para no perder el inicio.
          if (useSequence) {
            storyPlayer.stop();
            storyPlayer.play(() => setTimeout(() => handle.stop(), 300));
          }
        },
      });
      handleRef.current = handle;
      const r = await handle.done;
      const fname = `${safeFileName(name)}-${timestamp()}.${r.ext}`;
      setResult({ ...r, url: URL.createObjectURL(r.blob), name: fname });
      downloadBlob(r.blob, fname);
      useUiStore.getState().toast(`Grabación lista (${formatBytes(r.blob.size)})`, 'success');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de grabación');
    } finally {
      engine.setFixedSize(null);
      if (useSequence) storyPlayer.stop();
      handleRef.current = null;
      setRecording(false);
      useUiStore.getState().setRecording(false);
    }
  };

  return (
    <div className="stack">
      <div className="export-kind">
        <span className="ico">
          <Icon name="record" />
        </span>
        <div>
          <h3 style={{ margin: 0 }}>Grabación de la experiencia</h3>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            Graba en tiempo real lo que renderiza el navegador, con el audio del proyecto. La fluidez depende de tu equipo: si baja de los fps elegidos, el vídeo también.
          </p>
        </div>
      </div>
      <Segmented<ExportSettings['video']['source']>
        label="Qué grabar"
        value={settings.source}
        options={[
          { value: 'live', label: 'Escena en vivo' },
          { value: 'sequence', label: `Secuencia (${formatTime(seqDuration)})` },
        ]}
        onChange={(source) => updateExportSettings({ video: { source } })}
      />
      <Select<ExportSettings['video']['resolution']>
        label="Resolución"
        value={settings.resolution}
        options={(Object.keys(RESOLUTIONS) as ExportSettings['video']['resolution'][]).map((k) => ({ value: k, label: RESOLUTIONS[k].label }))}
        onChange={(resolution) => updateExportSettings({ video: { resolution } })}
        testId="video-resolution"
      />
      <div className="grid-2">
        <Select<string> label="FPS" value={String(settings.fps)} options={[{ value: '24', label: '24' }, { value: '30', label: '30' }, { value: '60', label: '60' }]} onChange={(v) => updateExportSettings({ video: { fps: Number(v) as 24 | 30 | 60 } })} />
        <Select<string> label="Formato" value={String(mimeIndex)} options={support.mimeTypes.map((m, i) => ({ value: String(i), label: m.label }))} onChange={(v) => setMimeIndex(Number(v))} />
      </div>
      <Slider label="Calidad (bitrate)" value={settings.bitrateMbps} min={1} max={40} step={1} unit=" Mbps" onChange={(bitrateMbps) => updateExportSettings({ video: { bitrateMbps } })} />
      {!useSequence && <Slider label="Duración" value={settings.durationSec} min={1} max={120} step={1} unit=" s" onChange={(durationSec) => updateExportSettings({ video: { durationSec } })} testId="video-duration" />}
      <Toggle label="Incluir audio" checked={settings.includeAudio} onChange={(includeAudio) => updateExportSettings({ video: { includeAudio } })} testId="video-audio" />
      {settings.includeAudio && !audioReady && <p className="hint">Aún no se ha iniciado el audio en esta sesión; se grabará la pista que suene (o silencio).</p>}
      {recording ? (
        <div className="stack" data-testid="video-progress">
          <div className="row">
            <span className="rec-badge" style={{ padding: 0 }}>
              {encoderReady ? <span className="dot" /> : <span className="spinner" />} {encoderReady ? 'Grabando' : 'Preparando codificador…'}
            </span>
            <span className="time grow">
              {formatTime(elapsed)} / {formatTime(duration)}
            </span>
          </div>
          <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((elapsed / Math.max(duration, 0.1)) * 100)}>
            <span style={{ width: `${Math.min(100, (elapsed / Math.max(duration, 0.1)) * 100)}%` }} />
          </div>
          <button type="button" className="btn btn-danger" onClick={() => handleRef.current?.stop()} data-testid="video-stop">
            <Icon name="stop" /> Detener y guardar
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary" onClick={start} data-testid="video-record">
          <Icon name="record" /> Grabar {formatTime(duration)} {willHaveAudio ? 'con audio' : settings.includeAudio ? '(audio si suena)' : 'sin audio'}
        </button>
      )}
      {error && <Notice kind="error">{error}</Notice>}
      {result && (
        <div className="stack" data-testid="video-result">
          <video src={result.url} controls className="result-preview" />
          <div className="result-file">
            <Icon name="check" />
            <div className="grow">
              <div>{result.name}</div>
              <div className="hint">
                {result.width}×{result.height} · {formatTime(result.durationSec)} · {formatBytes(result.blob.size)} · {result.hasAudio ? 'con pista de audio' : 'sin audio'}
              </div>
            </div>
            <button type="button" className="btn btn-sm" onClick={() => downloadBlob(result.blob, result.name)}>
              <Icon name="download" /> Descargar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectFileExport() {
  const project = useProjectStore((s) => s.project!);
  return (
    <div className="stack">
      <div className="export-kind">
        <span className="ico">
          <Icon name="file" />
        </span>
        <div>
          <h3 style={{ margin: 0 }}>Archivo de proyecto (.json)</h3>
          <p className="hint" style={{ margin: '2px 0 0' }}>
            Escena, parámetros, vinculaciones, secuencia y ajustes de exportación. Se puede importar desde la Biblioteca. Es la base del futuro reproductor web compartible. Las pistas de audio no se incluyen.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="btn"
        onClick={() => downloadBlob(new Blob([JSON.stringify(projectPackage(project), null, 2)], { type: 'application/json' }), `${safeFileName(project.name)}.emotion.json`)}
        data-testid="export-json"
      >
        <Icon name="download" /> Descargar proyecto
      </button>
    </div>
  );
}

export function ExportPanel() {
  const caps = useUiStore((s) => s.capabilities);
  return (
    <div className="inspector-inner" data-testid="panel-export">
      <div className="panel-header">
        <div>
          <h2>Export Studio</h2>
          <p>Tres tipos de salida distintos: no son equivalentes.</p>
        </div>
      </div>
      <div className="card">
        <ImageExport />
      </div>
      <div className="card">
        <VideoExport />
      </div>
      <div className="card">
        <div className="export-kind">
          <span className="ico" style={{ background: 'var(--violet-soft)', color: 'var(--accent-2)' }}>
            <Icon name="film" />
          </span>
          <div className="stack" style={{ gap: 6 }}>
            <div className="row">
              <h3 style={{ margin: 0 }}>Vídeo generado por IA</h3>
              <span className="badge">No disponible</span>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              Sería un vídeo nuevo creado por un modelo generativo externo a partir de la escena o un guion; no una grabación del motor. {caps?.video.reason ?? 'Planificado para una fase posterior.'} La arquitectura de adaptadores del servidor está preparada para añadir el proveedor.
            </p>
          </div>
        </div>
      </div>
      <Section title="Proyecto y experiencia compartible" defaultOpen={false}>
        <ProjectFileExport />
        <Notice kind="info">
          <strong>Experiencia web compartible (fase posterior).</strong> El motor es independiente de la interfaz y se alimenta solo con el JSON del proyecto, de modo que un reproductor ligero podrá publicarlo sin el editor. Ver
          docs/ARCHITECTURE.md.
        </Notice>
        <Notice kind="info">
          <strong>Alta resolución offline.</strong> Un render 4K/8K fotograma a fotograma sin pérdidas requiere un proceso especializado (render determinista + codificación en servidor). Alternativa funcional actual: captura de
          imagen hasta el límite de la GPU y grabación 1080p en tiempo real.
        </Notice>
      </Section>
    </div>
  );
}
