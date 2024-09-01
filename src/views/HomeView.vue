<template>
	<div class="channel-list">
		<v-progress-circular v-if="isLoading" indeterminate color="white"></v-progress-circular>
		<template v-else>
			<a
				class="channel-list__item"
				v-for="channel in availableChannels" :key="channel.id"
				:href="`https://${channel.subdomain}.tube.yt`"
			>
				<v-img 
					v-if="channel.thumbnails?.medium?.url" 
					:src="channel.thumbnails.medium.url" 
					:height="100" 
					:width="100" 
					aspect-ratio="1/1" 
					cover 
					alt="Channel logo" 
					@error="(event) => handleImageError(event, channel)"
				/>
			</a>
		</template>
	</div>
</template>

<script lang="ts">
import { ref, onMounted } from "vue";
import axios from "axios";

export default {
	setup() {
		const availableChannels = ref([]);
		const isLoading = ref(true);

		const fetchAvailableChannels = async () => {
			const baseUrl = import.meta.env.VITE_ENVIRONMENT === "production"
				? "https://tube.yt"
				: "http://localhost:3003";

			try {
				const response = await axios.get(`${baseUrl}/available-channels`);
				availableChannels.value = response.data.channels
					.map((channel) => {
						channel.thumbnails = channel.thumbnails !== 'no_value' ? JSON.parse(channel.thumbnails) : null;
						return channel;
					})
					.sort((a, b) => b.subscriberCount - a.subscriberCount);
					console.log('HERE', availableChannels.value);
			} catch (error) {
				console.error('Error fetching channels:', error);
			} finally {
				isLoading.value = false;
			}
		};

		const handleImageError = (event, channel) => {
			console.error('Error loading image for channel:', channel, 'Error:', event);
			// channel.thumbnails.medium.url = 'path/to/default/image.jpg';
		};

		onMounted(fetchAvailableChannels);

		return {
			availableChannels,
			isLoading,
			handleImageError
		};
	}
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
