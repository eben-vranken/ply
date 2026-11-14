import '@fontsource-variable/bricolage-grotesque/index.css';
import '@fontsource-variable/newsreader/wght-italic.css';
import '@lichess-org/chessground/assets/chessground.base.css';
import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

mount(App, { target: document.getElementById('app')! });
