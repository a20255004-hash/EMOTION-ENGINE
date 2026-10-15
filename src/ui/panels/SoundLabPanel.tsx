import { useEffect, useRef, useState } from 'react';
import { AUDIO_TARGETS, PARAM_DEFS } from '../../../shared/params';
import { AUDIO_SOURCES, type AudioSource, type TrackRef } from '../../../shared/schema';
import { audioEngine, type AudioState } from '../../audio/AudioEngine';
import { addDemoTrack, addGeneratedTrack, ensureTrackLoaded, importAudioFile } from '../../audio/tracks';
import { formatBytes, formatTime } from '../../export/files';
import { ApiError, fetchCapabilities, generateMusic } from '../../integrations/apiClient';
import { useProjectStore } from '../../state/projectStore';
import { useUiStore } from '../../state/uiStore';
import { ConfirmDialog, IconButton, Notice, Section, Slider, Toggle } from '../components/controls';
import { Icon } from '../components/Icon';
import { EMBEDDED } from '../../env';

export const SOURCE_LABEL: Record<AudioSource, string> = {
  bass: 'Graves',
  lowMid: 'Medios-graves',
  mid: 'Medios',
  high: 'Agudos',
  volume: 'Volumen',
  beat: 'Pulso',
};

function useAudioState() {
  const [s, setS] = useState<AudioState>(audioEngine.state);
  useEffect(() => audioEngine.subscribe(setS) as () => void, []);
  return s;
}

function Analyzer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const meterRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const bpmRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const settings = useProjectStore.getState().project?.audio.settings;
      if (settings) audioEngine.analyse(settings); // idempotente dentro del mismo fotograma
      const frame = audioEngine.lastFrame;
      for (const src of AUDIO_SOURCES) {
        const el = meterRefs.current[src];
        if (el) el.style.height = `${Math.round(frame[src] * 100)}%`;
      }
      if (bpmRef.current) bpmRef.current.textContent = audioEngine.bpm ? `${audioEngine.bpm} BPM` : '— BPM';
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth * dpr;
      const h = c.clientHeight * dpr;
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, w, h);
      const spec = audioEngine.getSpectrum();
      if (!spec.length || !audioEngine.active) {
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = `${12 * dpr}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('Sin señal · reproduce una pista o activa el micrófono', w / 2, h / 2);
        return;
      }
      // Escala logarítmica de 20 Hz a 16 kHz.
      const bars = 72;
      const sr = audioEngine.context?.sampleRate ?? 44100;
      const binHz = sr / (spec.length * 2);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#7cf0ff');
      grad.addColorStop(1, '#b694ff');
      ctx.fillStyle = grad;
      const bw = w / bars;
      for (let i = 0; i < bars; i++) {
        const f0 = 20 * Math.pow(800, i / bars);
        const f1 = 20 * Math.pow(800, (i + 1) / bars);
        const a = Math.floor(f0 / binHz);
        const b = Math.max(a + 1, Math.floor(f1 / binHz));
        let m = 0;
        for (let k = a; k < b && k < spec.length; k++) m = Math.max(m, spec[k]);
        const bh = (m / 255) * h * 0.95;
        ctx.fillRect(i * bw + 1, h - bh, Math.max(1, bw - 2), bh);
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="stack">
      <canvas ref={canvasRef} className="spectrum" aria-label="Espectro de frecuencias en tiempo real" role="img" data-testid="spectrum" />
      <div className="meters" data-testid="meters">
        {AUDIO_SOURCES.map((s) => (
          <div key={s} className="meter">
            <div className="meter-bar">
              <span ref={(el) => (meterRefs.current[s] = el)} data-testid={`meter-${s}`} style={{ height: '0%' }} />
            </div>
            {SOURCE_LABEL[s]}
          </div>
        ))}
      </div>
      <div className="hint">
        Tempo estimado: <span ref={bpmRef}>— BPM</span>
      </div>
    </div>
  );
}

function BindingLive({ source }: { source: AudioSource }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (ref.current) ref.current.style.width = `${Math.round(audioEngine.lastFrame[source] * 100)}%`;
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [source]);
  return (
    <span className="binding-live" title="Señal actual">
      <span ref={ref} />
    </span>
  );
}

function Bindings() {
  const bindings = useProjectStore((s) => s.project?.audio.bindings ?? []);
  const settings = useProjectStore((s) => s.project!.audio.settings);
  const { addBinding, updateBinding, removeBinding, updateAudioSettings } = useProjectStore.getState();
  return (
    <div className="stack" data-testid="bindings">
      <Toggle label="Vinculaciones activas" checked={settings.bindingsEnabled} onChange={(v) => updateAudioSettings({ bindingsEnabled: v })} testId="bindings-master" />
      {bindings.length === 0 && <p className="hint">Aún no hay vinculaciones. Añade una para que una banda del audio mueva un parámetro visual.</p>}
      {bindings.map((b) => (
        <div key={b.id} className="binding" data-enabled={b.enabled} data-testid="binding-row">
          <Toggle label={<span className="sr-only">Activar</span>} checked={b.enabled} onChange={(v) => updateBinding(b.id, { enabled: v })} />
          <select className="select" aria-label="Fuente de audio" value={b.source} onChange={(e) => updateBinding(b.id, { source: e.target.value as AudioSource })} data-testid="binding-source">
            {AUDIO_SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Parámetro visual" value={b.target} onChange={(e) => updateBinding(b.id, { target: e.target.value as typeof b.target })} data-testid="binding-target">
            {AUDIO_TARGETS.map((t) => (
              <option key={t} value={t}>
                {PARAM_DEFS[t].label}
              </option>
            ))}
          </select>
          <IconButton icon="trash" label="Eliminar vinculación" size="sm" onClick={() => removeBinding(b.id)} />
          <div className="binding-amount">
            <BindingLive source={b.source} />
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={b.amount}
              aria-label="Cantidad de respuesta"
              onChange={(e) => updateBinding(b.id, { amount: parseFloat(e.target.value) }, `binding:${b.id}`)}
              data-testid="binding-amount"
            />
            <span className="time" style={{ minWidth: 44 }}>
              {b.amount > 0 ? '+' : ''}
              {Math.round(b.amount * 100)}%
            </span>
          </div>
        </div>
      ))}
      <div className="row wrap">
        <button type="button" className="btn btn-sm" onClick={() => addBinding()} data-testid="add-binding" disabled={bindings.length >= 32}>
          <Icon name="plus" /> Añadir vinculación
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addBinding({ source: 'beat', target: 'intensity', amount: 0.4 })}>
          Pulso → resplandor
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => addBinding({ source: 'high', target: 'particleSize', amount: 0.3 })}>
          Agudos → partículas
        </button>
      </div>
    </div>
  );
}

function MusicGenerator() {
  const caps = useUiStore((s) => s.capabilities);
  const [prompt, setPrompt] = useState('Pad ambiental lento con pulsos graves suaves');
  const [duration, setDuration] = useState(12);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const music = caps?.music;

  if (!music) return <p className="hint">Comprobando servidor…</p>;
  if (!music.available) {
    return (
      <Notice kind="info">
        <strong>Generación musical no disponible.</strong> {music.reason} El editor funciona sin ella: importa tus archivos o usa la pista de demostración. Para activarla, configura <code>MUSIC_PROVIDER</code> en el
        servidor (ver README); la clave nunca se envía al navegador.
      </Notice>
    );
  }
  const max = music.maxDurationSec;
  const cost = music.costPerSecUsd * duration;
  const run = async () => {
    setBusy(true);
    setError(null);
    setElapsed(0);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const t0 = performance.now();
    const timer = setInterval(() => setElapsed((performance.now() - t0) / 1000), 200);
    try {
      audioEngine.ensure();
      const r = await generateMusic(prompt, duration, ctrl.signal);
      await addGeneratedTrack(r.blob, `${r.isMock ? '[Prueba] ' : ''}${prompt.slice(0, 60)}`, r.provider);
      useUiStore.getState().toast(r.isMock ? 'Pista de prueba generada por el sintetizador del servidor (no es IA).' : `Pista generada con ${r.provider}.`, 'success');
      useUiStore.getState().setCapabilities(await fetchCapabilities());
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      clearInterval(timer);
      setBusy(false);
      abortRef.current = null;
    }
  };
  return (
    <div className="stack" data-testid="music-generator">
      <div className="row wrap">
        <span className={`badge ${music.isMock ? 'warn' : 'ok'}`}>{music.isMock ? 'Proveedor de prueba (no es IA)' : `Proveedor: ${music.provider}`}</span>
        <span className="hint">
          Quedan {music.remainingToday}/{music.dailyLimit} hoy · máx. {max} s
        </span>
      </div>
      <div className="field">
        <label htmlFor="music-prompt">Descripción</label>
        <textarea id="music-prompt" className="textarea" value={prompt} maxLength={400} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      <Slider label="Duración" value={duration} min={4} max={max} step={1} unit=" s" onChange={setDuration} />
      <p className="hint">{music.costPerSecUsd > 0 ? `Coste estimado: ~${cost.toFixed(3)} USD (según la tarifa configurada en el servidor).` : 'Coste: no configurado / gratuito en este proveedor.'}</p>
      {error && <Notice kind="error">{error}</Notice>}
      <div className="row">
        <button type="button" className="btn btn-primary" onClick={run} disabled={busy || prompt.trim().length < 3 || music.remainingToday <= 0} data-testid="music-generate">
          {busy ? <span className="spinner" /> : <Icon name="sparkles" />} {busy ? `Generando… ${elapsed.toFixed(0)} s` : 'Generar pista'}
        </button>
        {busy && (
          <button type="button" className="btn btn-ghost" onClick={() => abortRef.current?.abort()}>
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}

export function SoundLabPanel() {
  const project = useProjectStore((s) => s.project);
  const audio = useAudioState();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<TrackRef | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [, force] = useState(0);
  useEffect(() => {
    if (!audio.playing) return;
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [audio.playing]);
  useEffect(() => {
    if (project) audioEngine.configure(project.audio.settings);
  }, [project?.audio.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!project) return null;
  const { settings, tracks, activeTrackId } = project.audio;
  const { updateAudioSettings, setActiveTrack, removeTrack } = useProjectStore.getState();

  const guard = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error desconocido');
    } finally {
      setBusy(null);
    }
  };

  const selectTrack = (t: TrackRef) =>
    guard('load', async () => {
      audioEngine.ensure();
      await ensureTrackLoaded(t.id);
      setActiveTrack(t.id);
      audioEngine.play(0);
    });

  const togglePlay = () =>
    guard('play', async () => {
      audioEngine.ensure();
      if (audio.input !== 'track' || !audio.trackId) {
        const id = activeTrackId ?? tracks[0]?.id;
        if (!id) throw new Error('Importa una pista o genera la de demostración primero.');
        await ensureTrackLoaded(id);
        setActiveTrack(id);
      }
      if (audioEngine.state.playing) audioEngine.pause();
      else audioEngine.play();
    });

  const current = audioEngine.currentTime;

  return (
    <div className="inspector-inner" data-testid="panel-sound">
      <div className="panel-header">
        <div>
          <h2>Sound Lab</h2>
          <p>Reproduce audio, analízalo y vincúlalo a la escena.</p>
        </div>
      </div>

      <div className="card">
        <h3>Fuentes</h3>
        <div className="row wrap">
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a,.aac,.webm"
            className="sr-only"
            data-testid="audio-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void guard('import', () => importAudioFile(f).then(() => audioEngine.play(0)));
            }}
          />
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            {busy === 'import' ? <span className="spinner" /> : <Icon name="upload" />} Importar audio
          </button>
          <button type="button" className="btn btn-sm" onClick={() => guard('demo', () => addDemoTrack().then(() => audioEngine.play(0)))} disabled={!!busy} data-testid="add-demo-track">
            {busy === 'demo' ? <span className="spinner" /> : <Icon name="music" />} Pista de demostración
          </button>
          <button
            type="button"
            className="btn btn-sm"
            aria-pressed={audio.input === 'mic'}
            onClick={() => guard('mic', async () => (audio.input === 'mic' ? audioEngine.stopMic() : audioEngine.startMic()))}
            disabled={EMBEDDED || (!!busy && busy !== 'mic')}
            title={EMBEDDED ? 'El micrófono no está disponible en la vista previa en línea' : undefined}
          >
            <Icon name="mic" /> {audio.input === 'mic' ? 'Detener micrófono' : 'Micrófono'}
          </button>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          MP3, WAV, OGG, FLAC, M4A/AAC o WebM, hasta 60 MB. Los archivos se guardan solo en este navegador.
        </p>
        {error && <Notice kind="error">{error}</Notice>}
        {tracks.length > 0 && (
          <div className="track-list" style={{ marginTop: 10 }} data-testid="track-list">
            {tracks.map((t) => (
              <div
                key={t.id}
                className="track"
                role="button"
                tabIndex={0}
                aria-current={audio.trackId === t.id}
                onClick={() => selectTrack(t)}
                onKeyDown={(e) => e.key === 'Enter' && selectTrack(t)}
                data-testid="track-item"
              >
                <Icon name={t.source === 'demo' ? 'music' : t.source === 'generated' ? 'sparkles' : 'wave'} className="grow-0" />
                <div className="grow">
                  <div className="track-name">{t.name}</div>
                  <div className="track-meta">
                    {formatTime(t.duration)} · {formatBytes(t.size)} · {t.source === 'upload' ? 'importada' : t.source === 'demo' ? 'sintetizada en el navegador' : `generada (${t.provider})`}
                  </div>
                </div>
                <IconButton icon="trash" size="sm" label="Eliminar pista" onClick={() => setConfirmDelete(t)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <h3>Reproducción</h3>
        <div className="transport">
          <IconButton icon={audio.playing && audio.input === 'track' ? 'pause' : 'play'} label={audio.playing ? 'Pausar audio' : 'Reproducir audio'} onClick={togglePlay} testId="audio-play" disabled={audio.input === 'mic'} />
          <IconButton icon="stop" label="Detener" onClick={() => audioEngine.stop()} disabled={audio.input !== 'track'} />
          <input
            type="range"
            min={0}
            max={Math.max(0.1, audio.duration)}
            step={0.05}
            value={Math.min(current, audio.duration)}
            onChange={(e) => audioEngine.seek(parseFloat(e.target.value))}
            disabled={audio.input !== 'track'}
            aria-label="Posición"
          />
          <span className="time" data-testid="audio-time">
            {formatTime(current)} / {formatTime(audio.duration)}
          </span>
        </div>
        <div className="row" style={{ marginTop: 10, gap: 16 }}>
          <Toggle label="Bucle" checked={settings.loop} onChange={(v) => updateAudioSettings({ loop: v })} />
          <div className="grow">
            <Slider label="Volumen" value={settings.volume} min={0} max={1} step={0.01} onChange={(v) => updateAudioSettings({ volume: v }, 'audio:volume')} />
          </div>
        </div>
        {audio.input === 'mic' && <p className="hint">El micrófono solo se analiza: no se reproduce por los altavoces para evitar acoples.</p>}
      </div>

      <Section title="Análisis en tiempo real">
        <Analyzer />
      </Section>

      <Section title="Respuesta">
        <Slider label="Sensibilidad" value={settings.sensitivity} min={0} max={3} step={0.01} onChange={(v) => updateAudioSettings({ sensitivity: v }, 'audio:sens')} testId="audio-sensitivity" hint="Ganancia de entrada del análisis" />
        <Slider label="Suavizado" value={settings.smoothing} min={0} max={0.95} step={0.01} onChange={(v) => updateAudioSettings({ smoothing: v }, 'audio:smooth')} hint="Promedio temporal del espectro" />
        <Slider label="Intensidad" value={settings.intensity} min={0} max={2} step={0.01} onChange={(v) => updateAudioSettings({ intensity: v }, 'audio:int')} hint="Multiplicador global de todas las vinculaciones" testId="audio-intensity" />
        <div className="grid-2">
          <Slider label="Ataque" value={settings.attack} min={0} max={1} step={0.01} onChange={(v) => updateAudioSettings({ attack: v }, 'audio:atk')} hint="Rapidez al subir" />
          <Slider label="Liberación" value={settings.release} min={0} max={1} step={0.01} onChange={(v) => updateAudioSettings({ release: v }, 'audio:rel')} hint="Rapidez al bajar" />
        </div>
      </Section>

      <Section title="Vinculaciones audio → visual" badge={<span className="section-badge">{project.audio.bindings.length}</span>}>
        <Bindings />
      </Section>

      <Section title="Generación musical (opcional)" defaultOpen={false}>
        <MusicGenerator />
      </Section>

      {confirmDelete && (
        <ConfirmDialog
          title="¿Eliminar pista?"
          message={`«${confirmDelete.name}» se quitará del proyecto y de las escenas que la usan.`}
          confirmLabel="Eliminar"
          danger
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            const t = confirmDelete;
            setConfirmDelete(null);
            audioEngine.forget(t.id);
            void removeTrack(t.id);
          }}
        />
      )}
    </div>
  );
}
