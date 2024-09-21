import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import vuetify from "./plugins/vuetify";
import Datepicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";

import { loadFonts } from "./plugins/webfontloader";
import "./assets/main.css";
import { inject } from "@vercel/analytics"

inject();
loadFonts();

const app = createApp(App);

app.use(router);
app.use(vuetify);
app.component("Datepicker", Datepicker);

app.mount("#app");
