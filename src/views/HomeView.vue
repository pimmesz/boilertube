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
	<v-btn @click="openRequestModal" color="primary" class="request-btn">Request</v-btn>
	<v-dialog v-model="showRequestModal" max-width="500px">
		<v-card>
			<v-card-title>Request a Channel</v-card-title>
			<v-card-text>
				<v-text-field 
					v-model="searchQuery" 
					label="Search for a channel" 
					@input="debouncedUpdateSearchResults"
				></v-text-field>
				<v-alert v-if="searchError" type="error" dense>
					{{ searchError }}
				</v-alert>
				<v-list v-if="searchResults.length > 0">
					<v-list-item
						v-for="result in searchResults"
						:key="result.id"
						@click="selectSearchResult(result)"
					>
						<v-list-item-content>
							<v-row align="center">
								<v-col cols="auto" class="mr-3">
									<v-img
										:src="result.thumbnails?.default?.url"
										:width="40"
										:height="40"
										class="rounded-circle"
									></v-img>
								</v-col>
								<v-col>
									<v-list-item-title>{{ result.name }}</v-list-item-title>
									<v-list-item-subtitle>{{ result.description }}</v-list-item-subtitle>
								</v-col>
							</v-row>
						</v-list-item-content>
					</v-list-item>
				</v-list>
			</v-card-text>
			<v-card-actions>
				<v-spacer></v-spacer>
				<v-btn color="blue darken-1" text @click="closeRequestModal">Cancel</v-btn>
			</v-card-actions>
		</v-card>
	</v-dialog>
</template>

<script lang="ts">
import { ref, onMounted } from "vue";
import axios from "axios";
import numeral from 'numeral';
import { debounce } from 'lodash-es';

export default {
	setup() {
		const availableChannels = ref([]);
		const isLoading = ref(true);
		const showRequestModal = ref(false);
		const searchQuery = ref('');
		const searchResults = ref([]);
		const searchError = ref('');

		const fetchAvailableChannels = async () => {
			const baseUrl = import.meta.env.VITE_ENVIRONMENT === "production"
				? "https://tube.yt"
				: "http://localhost:3003";

			try {
				const response = await axios.get(`${baseUrl}/available-channels`);
				availableChannels.value = response.data.channels
					.map((channel) => {
						channel.thumbnails = channel.thumbnails !== 'no_value' ? JSON.parse(channel.thumbnails) : null;
						channel.imageError = false;
						return channel;
					})
					.sort((a, b) => b.subscriberCount - a.subscriberCount);
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

		const openRequestModal = () => {
			showRequestModal.value = true;
			searchError.value = '';
		};

		const closeRequestModal = () => {
			showRequestModal.value = false;
			searchQuery.value = '';
			searchResults.value = [];
			searchError.value = '';
		};

		const updateSearchResults = async () => {
			const baseUrl = import.meta.env.VITE_ENVIRONMENT === "production"
				? "https://tube.yt"
				: "http://localhost:3003";

			if (searchQuery.value.trim() !== '') {
				try {
					const response = await axios.get(`${baseUrl}/search-channels/${encodeURIComponent(searchQuery.value)}`);
					searchResults.value = response.data.channels.map(channel => ({
						id: channel.id,
						name: channel.title,
						description: channel.description || 'N/A',
						thumbnails: channel.thumbnails
					}));
					searchError.value = '';
				} catch (error) {
					console.error('Error searching for channels:', error.response);
					searchResults.value = [];
					if (error.response && error.response.data && error.response.data.error) {
						searchError.value = error.response.data.error;
					} else {
						searchError.value = 'An error occurred while searching for channels';
					}
				}
			} else {
				searchResults.value = [];
				searchError.value = '';
			}
		};

		const debouncedUpdateSearchResults = debounce(async () => {
			await updateSearchResults();
		}, 500);

		const selectSearchResult = async (result) => {
			const message = `Selected channel: ${result.name}, Channel ID: ${result.id}`;
			const baseUrl = import.meta.env.VITE_ENVIRONMENT === "production"
				? "https://tube.yt"
				: "http://localhost:3003";

			try {
				await axios.post(`${baseUrl}/send-telegram-message`, { message });
			} catch (error) {
				console.error('Error sending message to Telegram:', error);
			}

			searchQuery.value = '';
			searchResults.value = [];
			showRequestModal.value = false;
		};

		onMounted(fetchAvailableChannels);

		return {
			availableChannels,
			isLoading,
			handleImageError,
			getHumanReadableNumber,
			showRequestModal,
			searchQuery,
			searchResults,
			searchError,
			openRequestModal,
			closeRequestModal,
			debouncedUpdateSearchResults,
			selectSearchResult
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

	.request-btn {
		position: fixed;
		bottom: 20px;
		right: 20px;
	}
</style>
