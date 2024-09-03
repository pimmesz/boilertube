<template>
	<div class="channel-list">
		<v-progress-circular v-if="isLoading" indeterminate color="white"></v-progress-circular>
		<template v-else>
			<a
				class="channel-list__item"
				v-for="channel in availableChannels" :key="channel.id"
				:href="`https://${channel.subdomain}.tube.yt`"
				:style="{ border: channel.imageError ? '1px solid white' : 'none' }"
			>
				<v-img 
					v-if="channel.thumbnails?.default?.url && !channel.imageError" 
					:src="channel.thumbnails.high.url" 
					:height="100" 
					:width="100" 
					aspect-ratio="1/1" 
					cover 
					alt="Channel logo" 
					@error="(event) => handleImageError(event, channel)"
					:lazy-src="channel.thumbnails.default.url"
					loading="lazy"
				>
					<template v-slot:placeholder>
						<v-row class="fill-height ma-0" align="center" justify="center">
							<v-progress-circular indeterminate color="grey lighten-5"></v-progress-circular>
						</v-row>
					</template>
				</v-img>
				<div v-else class="channel-list__item--name">
					<p>{{ channel.channelName }}</p>
				</div>
				<div v-if="channel.subscriberCount" class="subscriber-count">
					<v-icon icon="mdi-account-multiple" size="small" color="white" class="mr-1"></v-icon>
					<p>{{ getHumanReadableNumber(channel.subscriberCount) }}</p>
				</div>
				<!-- <div v-if="channel.updatedAt" class="last-updated">
					<v-icon icon="mdi-calendar" size="small" color="white" class="mr-1"></v-icon>
					<p>{{ new Date(channel.updatedAt).toLocaleDateString() }}</p>
				</div> -->
			</a>
		</template>
	</div>
</template>

<script lang="ts">
import { computed,ref, onMounted } from "vue";
import axios from "axios";
import numeral from 'numeral';

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
						if (channel.thumbnails) {
							for (const size in channel.thumbnails) {
								if (channel.thumbnails[size] && channel.thumbnails[size].url) {
									channel.thumbnails[size].url = channel.thumbnails[size].url.replace('ggpht', 'googleusercontent');
								}
							}
						}
						channel.imageError = false;
						return channel;
					})
					.sort((a, b) => b.subscriberCount - a.subscriberCount);
				console.log(availableChannels.value);
			} catch (error) {
				console.error('Error fetching channels:', error);
			} finally {
				isLoading.value = false;
			}
		};

		const getHumanReadableNumber = (number: number) => {
			return numeral(number).format('0.0a');
		};

		const handleImageError = (event, channel) => {
			console.error('Error loading image for channel:', channel, 'Error:', event);
			channel.imageError = true;
		};

		onMounted(fetchAvailableChannels);

		return {
			availableChannels,
			isLoading,
			handleImageError,
			getHumanReadableNumber
		};
	}
};
</script>

<style scoped>	
	.channel-list {
		display: flex;
		justify-content: center;
		align-items: center;
		overflow-x: scroll;
		flex-wrap: wrap;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		position: absolute;
		width: 100vw;
	}

	.channel-list__item {
		margin: 10px;
		color: #000;
		text-align: center;
		text-decoration: none;
	}
	
	.channel-list__item--name {
		padding: 10px;
		width: 100px;
		height: 50px;
		color: white;
	}

	.subscriber-count, .last-updated {
		margin-top: 5px;
		font-size: 14px;
		color: #555;
		display: flex;	
		align-items: center;
		justify-content: center;	
		color: white;
		text-decoration: none;
	}

</style>
