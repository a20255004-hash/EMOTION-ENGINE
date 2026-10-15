import { makeId } from '../../shared/operations';
import type { TrackRef } from '../../shared/schema';
import { repository } from '../storage/ProjectRepository';
import { useProjectStore } from '../state/projectStore';
import { audioEngine, MAX_AUDIO_BYTES, SUPPORTED_AUDIO } from './AudioEngine';
import { renderDemoTrack } from './demoTrack';

/** Carga en el motor de audio una pista guardada del proyecto. */
export async function ensureTrackLoaded(trackId: string) {
  if (audioEngine.state.trackId === trackId && audioEngine.state.input === 'track') return;
  const blob = await repository.getBlob(trackId);
  if (!blob) throw new Error('No se encontró el archivo de audio de esta pista. Vuelve a importarlo.');
  await audioEngine.loadTrack(trackId, blob);
}

export function validateAudioFile(file: File): string | null {
  if (file.size > MAX_AUDIO_BYTES) return `El archivo supera ${MAX_AUDIO_BYTES / 1024 / 1024} MB.`;
  const okType = SUPPORTED_AUDIO.includes(file.type) || /\.(mp3|wav|ogg|oga|flac|m4a|aac|webm)$/i.test(file.name);
  if (!okType) return 'Formato no compatible. Usa MP3, WAV, OGG, FLAC, M4A/AAC o WebM.';
  return null;
}

export async function importAudioFile(file: File): Promise<TrackRef> {
  const err = validateAudioFile(file);
  if (err) throw new Error(err);
  const id = makeId('trk');
  // Decodificar primero garantiza que el archivo es reproducible antes de guardarlo.
  const buf = await audioEngine.decode(id, file);
  const ref: TrackRef = { id, name: file.name.replace(/\.[^.]+$/, '').slice(0, 200), mime: file.type || 'audio/*', size: file.size, duration: buf.duration, source: 'upload', createdAt: Date.now() };
  await useProjectStore.getState().addTrack(ref, file);
  await audioEngine.loadTrack(id, file);
  return ref;
}

export async function addDemoTrack(): Promise<TrackRef> {
  audioEngine.ensure();
  const blob = await renderDemoTrack(24);
  const id = makeId('trk');
  const buf = await audioEngine.decode(id, blob);
  const ref: TrackRef = { id, name: 'Pulso de demostración · 116 BPM', mime: 'audio/wav', size: blob.size, duration: buf.duration, source: 'demo', createdAt: Date.now() };
  await useProjectStore.getState().addTrack(ref, blob);
  await audioEngine.loadTrack(id, blob);
  return ref;
}

export async function addGeneratedTrack(blob: Blob, name: string, provider: string): Promise<TrackRef> {
  const id = makeId('trk');
  const buf = await audioEngine.decode(id, blob);
  const ref: TrackRef = { id, name: name.slice(0, 200), mime: blob.type || 'audio/wav', size: blob.size, duration: buf.duration, source: 'generated', provider, createdAt: Date.now() };
  await useProjectStore.getState().addTrack(ref, blob);
  await audioEngine.loadTrack(id, blob);
  return ref;
}
