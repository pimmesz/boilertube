<template>
	<div class="channel-list">
		<a
			class="channel-list__item"
			:href="`https://${channel.subdomain}.tube.yt`"
			target="_blank"
			v-for="channel in availableChannels" :key="channel.id"
		>
			{{ channel.channelName }}
		</a>
	</div>
</template>

<script lang="ts">
import { ref } from "vue";
import axios from "axios";

export default {
	setup() {
		const availableChannels = ref([]);

		return {
			availableChannels
		};
	},
	created() {
		this.fetchAvailableChannels();
	},
	methods: {
		fetchAvailableChannels() {
			const baseUrl = import.meta.env.VITE_ENVIRONMENT === "production"
				? "https://tube.yt"
				: "http://localhost:3003";

			axios
				.get(`${baseUrl}/available-channels`)
				.then((response) => {
					console.log('RECEIVED', response.data)
					this.availableChannels  = response.data.channels
				})
				.catch((error) => {
					console.log(error);
				});
		},
	},
};
</script>

<style scoped>	
	.channel-list {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 10px;
	}

	.channel-list__item {
		display: block;
		padding: 10px;
		margin: 10px;
		border: 1px solid #000;
		text-align: center;
		text-decoration: none;
		color: #000;
	}
</style>
