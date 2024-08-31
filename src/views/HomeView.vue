<template>
	<div class="channel-list">
		<v-progress-circular v-if="isLoading" indeterminate color="white"></v-progress-circular>
		<a
			class="channel-list__item"
			:href="`https://${channel.subdomain}.tube.yt`"
			v-else
			v-for="channel in availableChannels" :key="channel.id"
		>
			<v-img :height="100" :width="100" aspect-ratio="1/1" cover v-if="channel.thumbnails?.medium?.url" :src="channel.thumbnails?.medium?.url" alt="Channel logo" />
		</a>
	</div>
</template>

<script lang="ts">
import { ref } from "vue";
import axios from "axios";

export default {
	setup() {
		const availableChannels = ref([]);
		const isLoading = ref(true);

		return {
			availableChannels,
			isLoading
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
					this.availableChannels  = response.data.channels.map((channel) => {
						channel.thumbnails = channel.thumbnails !== 'no_value' ? JSON.parse(channel.thumbnails) : null;
						return channel;
					}).sort((a, b) => b.subscriberCount - a.subscriberCount);

					this.isLoading = false;
				})
				.catch((error) => {
					console.log(error);
					this.isLoading = false;
				});
		},
	},
};
</script>

<style scoped>	
	.channel-list {
		display: flex;
    justify-content: center;
    overflow-x: scroll;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    position: absolute;
    width: 100vw;
}

.channel-list__item {
    margin: 10px;
    border: 1px solid #000;
    color: #000;
}
</style>
