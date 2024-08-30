<template>
	<div class="channel-list">
		<a
			class="channel-list__item"
			:href="`https://${channel.subdomain}.tube.yt`"
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
					this.availableChannels  = response.data.channels.map((channel) => {
						channel.thumbnails = channel.thumbnails !== 'no_value' ? JSON.parse(channel.thumbnails) : null;
						return channel;
					});
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
    padding: 50px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    margin: 10px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    width: 100%;
	}

	.channel-list__item {
		align-items: center;
		display: flex;
		flex-direction: column;
		margin: 10px;
		border: 1px solid #000;
		text-align: center;
		text-decoration: none;
		color: #000;
		height: 100px;
		width: 100px
	}
</style>
