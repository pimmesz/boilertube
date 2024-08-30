<template>
	<div class="channel-list">
		<a
			class="channel-list__item"
			:href="`https://${channel.subdomain}.tube.yt`"
			v-for="channel in availableChannels" :key="channel.id"
		>
			<h1>{{ channel.channelName }}</h1>
			<img v-if="channel.thumbnail" :src="channel.thumbnail" alt="Channel logo" />
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
		display: flex;
		justify-content: center;
		align-items: center;
		padding: 10px;
		margin: 10px;
		border: 1px solid #000;
		text-align: center;
		text-decoration: none;
		color: #000;
	}
	
	.channel-list__item img {
		display: block;
		height: 100px;
		margin-left: 20px;
	}
</style>
