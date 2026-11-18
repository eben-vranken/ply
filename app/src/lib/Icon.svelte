<script lang="ts">
  // Ply's own icon set: 24px grid, 2px round strokes. Drawn for this app (GPL-3.0).
  const P: Record<string, string> = {
    today: 'M4 15h16M4 19h16M6 11a6 6 0 0 1 12 0',
    explore: 'M12 3v4M12 17v4M3 12h4M17 12h4M15 9l-1.6 4.4L9 15l1.6-4.4z',
    repertoire: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
    stats: 'M5 20V11M12 20V4M19 20v-6',
    settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
    back: 'M15 5l-7 7 7 7',
    close: 'M6 6l12 12M18 6L6 18',
    next: 'M9 5l7 7-7 7',
    first: 'M17 5l-7 7 7 7M7 5v14',
    last: 'M7 5l7 7-7 7M17 5v14',
    flip: 'M7 20V4M4 7l3-3 3 3M17 4v16M14 17l3 3 3-3',
    games: 'M4 4v16h16M7 15l4-5 3 3 5-7',
    thumb: 'M7 11v9H4v-9zM7 11l4-7c1.5 0 2.5 1 2.2 2.6L12.5 10H19a1.5 1.5 0 0 1 1.5 1.8l-1.4 6.6A2 2 0 0 1 17.1 20H7',
    hint: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
    undo: 'M8 5L4 9l4 4M4 9h10a6 6 0 0 1 0 12h-3',
    search: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM16 16l5 5',
    star: 'M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.600 19.8l1.1-6.1L3.2 9.400l6.1-.8z',
    sword: 'M20 4l-9 9M20 4h-4M20 4v4M8 12l4 4M5 19l4-4M4 20l1-1',
    warn: 'M12 4l9 16H3zM12 10v5M12 17.500v.5',
    layers: 'M12 4l9 4.500-9 4.500-9-4.500zM3 13l9 4.500 9-4.500M3 17l9 4.500 9-4.500',
    check: 'M5 12.500l4.500 4.500L19 7',
    play: 'M8 5l11 7-11 7z',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    book: 'M12 6.5C10 5 7 4.5 4 4.5v13c3 0 6 .5 8 2 2-1.500 5-2 8-2v-13c-3 0-6 .5-8 2zM12 6.5v13',
    unfold: 'M8 9l4-4 4 4M8 15l4 4 4-4',
    trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
    share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6',
    fit: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
    fold: 'M8 4l4 4 4-4M8 20l4-4 4 4',
    flame: 'M12 2.500c.5 3 3 4.500 4.500 7 1 1.700 1.500 3.300 1.500 5a6 6 0 0 1-12 0c0-1.800.7-3.300 1.800-4.500.3 1.300 1 2.200 2 2.700-.3-3.200.4-6.800 2.200-10.200z',
    wifi: 'M4 9a12 12 0 0 1 16 0M7 12.500a7.500 7.500 0 0 1 10 0M12 17v.5',
    freeze: 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5M3.6 10.8l3.4.9-.9-3.4M20.4 13.2l-3.4-.9.9 3.4M6.1 15.7l.9-3.4-3.4.9M17.9 8.3l-.9 3.4 3.4-.9'
  };
  let { name, size = 24, fill = false }: { name: string; size?: number; fill?: boolean } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill={fill ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={P[name]} /></svg>

<style>svg { display: block; flex: none; }</style>
