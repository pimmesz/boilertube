<template>
	<div class="home-container">
		<!-- Header -->
		<header class="site-header">
			<h1>Tube.yt</h1>
			<p class="tagline">Discover the most viewed videos from your favorite YouTube channels</p>
		</header>

		<!-- Controls -->
		<div class="controls" v-if="!isLoading && availableChannels.length > 0">
			<v-text-field
				v-model="searchQuery"
				placeholder="Search channels..."
				prepend-inner-icon="mdi-magnify"
				variant="outlined"
				density="compact"
				hide-details
				clearable
				class="search-field"
			></v-text-field>
			<v-select
				v-model="sortBy"
				:items="sortOptions"
				item-title="label"
				item-value="value"
				variant="outlined"
				density="compact"
				hide-details
				class="sort-select"
			></v-select>
		</div>

		<!-- Channel Grid -->
		<div class="channel-grid">
			<!-- Loading Skeletons -->
			<template v-if="isLoading">
				<div v-for="n in 8" :key="n" class="channel-card channel-card--skeleton">
					<v-skeleton-loader type="avatar" :width="100" :height="100"></v-skeleton-loader>
					<v-skeleton-loader type="text" :width="80" class="mt-2"></v-skeleton-loader>
					<v-skeleton-loader type="text" :width="60" class="mt-1"></v-skeleton-loader>
				</div>
			</template>

			<!-- Error State -->
			<div v-else-if="error" class="error-state">
				<v-icon icon="mdi-alert-circle" size="64" color="white"></v-icon>
				<p>{{ error }}</p>
				<v-btn color="white" variant="outlined" @click="fetchAvailableChannels">
					<v-icon icon="mdi-refresh" class="mr-2"></v-icon>
					Retry
				</v-btn>
			</div>

			<!-- No Results -->
			<div v-else-if="filteredChannels.length === 0 && searchQuery" class="no-results">
				<v-icon icon="mdi-magnify" size="64" color="white" opacity="0.5"></v-icon>
				<p>No channels found for "{{ searchQuery }}"</p>
			</div>

			<!-- Channel Cards -->
			<template v-else>
				<a
					v-for="(channel, index) in filteredChannels"
					:key="channel.id"
					class="channel-card"
					:href="`https://${channel.subdomain}.tube.yt`"
					:style="{ animationDelay: `${index * 50}ms` }"
					@keydown.enter="navigateToChannel(channel.subdomain)"
					tabindex="0"
				>
					<div class="channel-card__image">
						<v-img
							v-if="channel.thumbnails?.default?.url && !channel.imageError"
							:src="channel.thumbnails.high?.url"
							:height="100"
							:width="100"
							aspect-ratio="1/1"
							cover
							alt="Channel logo"
							@error="() => handleImageError(channel)"
							:lazy-src="channel.thumbnails.default?.url"
							loading="lazy"
							class="channel-avatar"
						>
							<template v-slot:placeholder>
								<v-row class="fill-height ma-0" align="center" justify="center">
									<v-progress-circular indeterminate color="grey lighten-5" size="24"></v-progress-circular>
								</v-row>
							</template>
						</v-img>
						<div v-else class="channel-card__fallback">
							{{ channel.channelName?.charAt(0)?.toUpperCase() || '?' }}
						</div>
					</div>
					<p class="channel-card__name">{{ channel.channelName }}</p>
					<div class="channel-card__meta">
						<span class="channel-card__subscribers">
							<v-icon icon="mdi-account-multiple" size="x-small"></v-icon>
							{{ formatNumber(channel.subscriberCount) }}
						</span>
						<span class="channel-card__updated">
							<v-icon icon="mdi-calendar" size="x-small"></v-icon>
							{{ formatRelativeDate(channel.updatedAt) }}
						</span>
					</div>
				</a>
			</template>
		</div>

		<!-- Featured Videos Section -->
		<section v-if="!isLoading && featuredVideos.length > 0" class="featured-section">
			<h2 class="featured-title">
				<v-icon icon="mdi-fire" class="mr-2"></v-icon>
				Trending
			</h2>
			<p class="featured-subtitle">Videos performing exceptionally well compared to their channel average</p>
			<div class="featured-grid">
				<a
					v-for="video in featuredVideos"
					:key="video.id"
					:href="`https://www.youtube.com/watch?v=${video.id}`"
					target="_blank"
					class="featured-card"
				>
					<div class="featured-card__thumbnail">
						<v-img
							:src="video.thumbnails?.medium?.url || video.thumbnails?.default?.url"
							:aspect-ratio="16/9"
							cover
							class="featured-thumbnail"
						>
							<template v-slot:placeholder>
								<v-row class="fill-height ma-0" align="center" justify="center">
									<v-progress-circular indeterminate color="grey lighten-5" size="24"></v-progress-circular>
								</v-row>
							</template>
						</v-img>
						<div class="featured-card__score">
							<v-icon icon="mdi-trending-up" size="x-small"></v-icon>
							{{ Math.round(video.score * 100) }}%
						</div>
					</div>
					<div class="featured-card__content">
						<p class="featured-card__title">{{ video.title }}</p>
						<div class="featured-card__meta">
							<span class="featured-card__channel">{{ video.channel }}</span>
							<span class="featured-card__views">
								<v-icon icon="mdi-eye" size="x-small"></v-icon>
								{{ formatNumber(video.viewCount) }} views
							</span>
						</div>
						<p class="featured-card__comparison">
							Channel avg: {{ formatNumber(video.avgViews) }} views
						</p>
					</div>
				</a>
			</div>
		</section>
	</div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import axios from 'axios';
import { getBaseUrl, formatNumber, parseThumbnails, type Channel } from '@/utils';

interface FeaturedVideo {
	id: string;
	title: string;
	channel: string;
	viewCount: number;
	score: number;
	avgViews: number;
	thumbnails: {
		default?: { url: string };
		medium?: { url: string };
		high?: { url: string };
	};
}

const availableChannels = ref<Channel[]>([]);
const featuredVideos = ref<FeaturedVideo[]>([]);
const isLoading = ref(true);
const error = ref('');
const searchQuery = ref('');
const sortBy = ref('subscribers');

const sortOptions = [
	{ label: 'Most subscribers', value: 'subscribers' },
	{ label: 'Name (A-Z)', value: 'name' },
	{ label: 'Recently updated', value: 'updated' }
];

const filteredChannels = computed(() => {
	let channels = [...availableChannels.value];

	// Filter by search
	if (searchQuery.value) {
		const query = searchQuery.value.toLowerCase();
		channels = channels.filter(c =>
			c.channelName?.toLowerCase().includes(query) ||
			c.subdomain?.toLowerCase().includes(query)
		);
	}

	// Sort
	switch (sortBy.value) {
		case 'subscribers':
			channels.sort((a, b) => b.subscriberCount - a.subscriberCount);
			break;
		case 'name':
			channels.sort((a, b) => (a.channelName || '').localeCompare(b.channelName || ''));
			break;
		case 'updated':
			channels.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
			break;
	}

	return channels;
});

const formatRelativeDate = (dateStr: string) => {
	const date = new Date(dateStr);
	const now = new Date();
	const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Yesterday';
	if (diffDays < 7) return `${diffDays}d ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
	return `${Math.floor(diffDays / 30)}mo ago`;
};

const fetchAvailableChannels = async () => {
	isLoading.value = true;
	error.value = '';

	try {
		const response = await axios.get(`${getBaseUrl()}/available-channels`);
		availableChannels.value = response.data.channels.map((channel: any) => ({
			...channel,
			thumbnails: parseThumbnails(channel.thumbnails),
			imageError: false
		}));
	} catch (err) {
		console.error('Error fetching channels:', err);
		error.value = 'Failed to load channels. Please try again.';
	} finally {
		isLoading.value = false;
	}
};

const fetchFeaturedVideos = async () => {
	try {
		const response = await axios.get(`${getBaseUrl()}/featured-videos`);
		featuredVideos.value = response.data.featured.map((video: any) => ({
			...video,
			thumbnails: parseThumbnails(video.thumbnails)
		}));
	} catch (err) {
		console.error('Error fetching featured videos:', err);
	}
};

const handleImageError = (channel: Channel) => {
	channel.imageError = true;
};

const navigateToChannel = (subdomain: string) => {
	window.location.href = `https://${subdomain}.tube.yt`;
};

onMounted(() => {
	fetchAvailableChannels();
	fetchFeaturedVideos();
});
</script>

<style scoped>
.home-container {
	min-height: 100vh;
	padding: 40px 20px;
	max-width: 1200px;
	margin: 0 auto;
}

.site-header {
	text-align: center;
	margin-bottom: 40px;
}

.site-header h1 {
	font-size: 2.5rem;
	font-weight: 700;
	margin-bottom: 8px;
}

.tagline {
	font-size: 1.1rem;
	opacity: 0.9;
}

.controls {
	display: flex;
	gap: 16px;
	margin-bottom: 32px;
	justify-content: center;
	flex-wrap: wrap;
}

.search-field {
	max-width: 300px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 8px;
}

.sort-select {
	max-width: 200px;
	background: rgba(255, 255, 255, 0.1);
	border-radius: 8px;
}

.channel-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
	gap: 24px;
	justify-items: center;
}

.channel-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	text-decoration: none;
	color: white;
	padding: 16px;
	border-radius: 12px;
	transition: all 0.2s ease;
	background: rgba(255, 255, 255, 0.05);
	width: 100%;
	max-width: 160px;
	animation: fadeInUp 0.4s ease forwards;
	opacity: 0;
}

@keyframes fadeInUp {
	from {
		opacity: 0;
		transform: translateY(20px);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

.channel-card:hover,
.channel-card:focus {
	background: rgba(255, 255, 255, 0.15);
	transform: translateY(-4px);
	outline: none;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.channel-card--skeleton {
	animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
	0%, 100% { opacity: 0.6; }
	50% { opacity: 0.3; }
}

.channel-card__image {
	margin-bottom: 12px;
}

.channel-avatar {
	border-radius: 50%;
	border: 3px solid rgba(255, 255, 255, 0.2);
}

.channel-card__fallback {
	width: 100px;
	height: 100px;
	border-radius: 50%;
	background: rgba(255, 255, 255, 0.2);
	display: flex;
	align-items: center;
	justify-content: center;
	font-size: 2rem;
	font-weight: 700;
}

.channel-card__name {
	font-weight: 600;
	font-size: 0.9rem;
	text-align: center;
	margin-bottom: 8px;
	line-height: 1.3;
	max-width: 100%;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.channel-card__meta {
	display: flex;
	flex-direction: column;
	gap: 4px;
	font-size: 0.75rem;
	opacity: 0.8;
}

.channel-card__subscribers,
.channel-card__updated {
	display: flex;
	align-items: center;
	gap: 4px;
}

.error-state,
.no-results {
	grid-column: 1 / -1;
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 16px;
	padding: 48px;
	text-align: center;
}

/* Featured Videos Section */
.featured-section {
	margin-top: 64px;
	padding-top: 48px;
	border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.featured-title {
	font-size: 1.3rem;
	font-weight: 600;
	margin-bottom: 8px;
	display: flex;
	align-items: center;
}

.featured-subtitle {
	font-size: 0.9rem;
	opacity: 0.7;
	margin-bottom: 24px;
}

.featured-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
	gap: 24px;
}

.featured-card {
	display: flex;
	flex-direction: column;
	background: rgba(255, 255, 255, 0.05);
	border-radius: 12px;
	text-decoration: none;
	color: white;
	transition: all 0.2s ease;
	overflow: hidden;
}

.featured-card:hover {
	background: rgba(255, 255, 255, 0.1);
	transform: translateY(-4px);
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.featured-card__thumbnail {
	position: relative;
}

.featured-thumbnail {
	border-radius: 12px 12px 0 0;
}

.featured-card__score {
	position: absolute;
	bottom: 8px;
	right: 8px;
	background: rgba(0, 0, 0, 0.8);
	color: #4ade80;
	padding: 4px 8px;
	border-radius: 4px;
	font-size: 0.75rem;
	font-weight: 600;
	display: flex;
	align-items: center;
	gap: 4px;
}

.featured-card__content {
	padding: 16px;
}

.featured-card__title {
	font-weight: 600;
	font-size: 0.95rem;
	margin-bottom: 8px;
	line-height: 1.3;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}

.featured-card__meta {
	display: flex;
	align-items: center;
	gap: 12px;
	font-size: 0.8rem;
	opacity: 0.8;
	margin-bottom: 8px;
}

.featured-card__channel {
	font-weight: 500;
}

.featured-card__views {
	display: flex;
	align-items: center;
	gap: 4px;
}

.featured-card__comparison {
	font-size: 0.75rem;
	opacity: 0.6;
}

@media (max-width: 600px) {
	.site-header h1 {
		font-size: 1.8rem;
	}

	.tagline {
		font-size: 0.95rem;
	}

	.controls {
		flex-direction: column;
		align-items: stretch;
	}

	.search-field,
	.sort-select {
		max-width: 100%;
	}

	.channel-grid {
		grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
		gap: 16px;
	}

	.featured-grid {
		grid-template-columns: 1fr;
	}
}
</style>
