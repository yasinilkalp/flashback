import { createApp } from 'vue';
import App from './App.vue';
import { mountFlashback } from './flashback';

createApp(App).mount('#app');
mountFlashback(document.getElementById('flashback-root')!);
