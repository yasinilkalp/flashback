import { createApp } from 'vue';
import App from './App.vue';
import { mountRewind } from './rewind';

createApp(App).mount('#app');
mountRewind(document.getElementById('rewind-root')!);
