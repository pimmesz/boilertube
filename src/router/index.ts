import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import Test from "../views/Test.vue";

// Function to get the subdomain
function getSubdomain() {
	const host = window.location.hostname;
	const parts = host.split(".");
	if (parts.length > 2) {
		return parts[0]; // Assuming subdomain is the first part of the hostname
	}
	return null;
}

// Determine the appropriate component based on the subdomain
const homeComponent = getSubdomain() ? Test : HomeView;

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