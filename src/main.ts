import { mount } from 'svelte';
import { registerServiceWorker } from '@/capabilities/pwa';
import './app.css';
import App from './App.svelte';

registerServiceWorker();

const target = document.getElementById('app');
if (!target) {
	throw new Error('Root element #app not found');
}

mount(App, { target });
