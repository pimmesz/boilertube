import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import SubdomainView from "../views/SubdomainView.vue";

// Function to check if we should show subdomain view
function shouldShowSubdomainView() {
	const host = window.location.hostname;

	// On localhost, check for ?channel= query parameter
	if (host === 'localhost' || host === '127.0.0.1') {
		const params = new URLSearchParams(window.location.search);
		return params.has('channel') && params.get('channel') !== '';
	}

	// In production, check for subdomain
	const parts = host.split(".");
	return parts.length > 2;
}

// Determine the appropriate component
const homeComponent = shouldShowSubdomainView() ? SubdomainView : HomeView;

const router = createRouter({
	history: createWebHistory(import.meta.env.BASE_URL),
	routes: [
		{
			path: "/",
			name: "home",
			component: homeComponent,
		},
	],
});

export default router;
