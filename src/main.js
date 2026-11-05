import { App } from './ui/App.js';

const root = document.getElementById('app');
new App(root);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
