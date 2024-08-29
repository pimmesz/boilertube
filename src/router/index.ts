import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import Test from "../views/Test.vue";

// Function to get the subdomain
function hasSubdomain() {
	const host = window.location.hostname;
	const parts = host.split(".");
	if (parts.length > 2) {
		return true;
	}
	return false;
}

// Determine the appropriate component based on the subdomain
const homeComponent = hasSubdomain() ? Test : HomeView;

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