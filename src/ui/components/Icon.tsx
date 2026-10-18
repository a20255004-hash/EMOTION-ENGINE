const PATHS = {
  studio: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zm0 0v9m0 0l8-4.5M12 12L4 7.5',
  sound: 'M4 14v-4M8 18V6M12 15V9M16 20V4M20 14v-4',
  story: 'M4 5h16v14H4zM4 9h16M9 5v4M15 5v4M10 13l4 2-4 2z',
  export: 'M12 3v12m0 0l-4-4m4 4l4-4M5 21h14',
  library: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  play: 'M7 4.5v15l12-7.5z',
  pause: 'M7 4h4v16H7zM13 4h4v16h-4z',
  stop: 'M6 6h12v12H6z',
  reset: 'M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  exitFullscreen: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  chevron: 'M9 6l6 6-6 6',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  upload: 'M12 16V4m0 0L8 8m4-4l4 4M5 20h14',
  download: 'M12 4v12m0 0l-4-4m4 4l4-4M5 20h14',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM6 11a6 6 0 0 0 12 0M12 17v4',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  wave: 'M2 12c2-6 4-6 6 0s4 6 6 0 4-6 6 0 2 3 2 3',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 11v6M12 7.5v.5',
  warning: 'M12 3l10 18H2zM12 10v5M12 18v.5',
  check: 'M5 12l5 5L20 7',
  close: 'M6 6l12 12M18 6L6 18',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  up: 'M12 19V5m0 0l-6 6m6-6l6 6',
  down: 'M12 5v14m0 0l-6-6m6 6l6-6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeOff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6 0 10 7 10 7a17 17 0 0 1-3.2 3.9M6.6 6.6C3.9 8.4 2 12 2 12s4 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
  record: 'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 1 0 0-.01',
  film: 'M4 4h16v16H4zM8 4v16M16 4v16M4 8h4M4 12h4M4 16h4M16 8h4M16 12h4M16 16h4',
  cpu: 'M7 7h10v10H7zM10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3',
  save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  shuffle: 'M4 7h3c5 0 5 10 10 10h3M4 17h3c2 0 3-1.5 4-3.5M17 7h3m0 0l-2-2m2 2l-2 2M20 17l-2-2m2 2l-2 2M13 9.5C14 8 15 7 17 7',
  dice: 'M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8.5 8.5h.01M15.5 8.5h.01M12 12h.01M8.5 15.5h.01M15.5 15.5h.01',
  volume: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11',
  volumeOff: 'M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17v.5',
  palette: 'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1-.8-1.3-.8-2.2 0-.8.7-1.3 1.5-1.3H17a4 4 0 0 0 4-4c0-5-4-9-9-9zM7.5 11h.01M10 7h.01M14.5 7h.01',
  orbit: 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM3 12c0-2.8 4-5 9-5s9 2.2 9 5-4 5-9 5-9-2.2-9-5z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, title }: { name: IconName; className?: string; title?: string }) {
  const filled = name === 'play' || name === 'pause' || name === 'stop' || name === 'record';
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
