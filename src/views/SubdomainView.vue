<template>
  <v-container class="fill-height subdomain-container">
    <v-row no-gutters>
      <!-- Left Column - Filter Panel -->
      <v-col cols="12" sm="5" md="4" lg="3" xl="3" offset-sm="1" offset-md="1" offset-lg="2" offset-xl="2">
        <!-- Loading Skeleton for Filter Panel -->
        <div v-if="channelIsLoading" class="filter-skeleton">
          <v-skeleton-loader type="heading" class="mb-4"></v-skeleton-loader>
          <v-skeleton-loader type="text" class="mb-2"></v-skeleton-loader>
          <v-skeleton-loader type="text" class="mb-4"></v-skeleton-loader>
          <v-skeleton-loader type="button" class="mb-2"></v-skeleton-loader>
          <v-skeleton-loader type="button" class="mb-2"></v-skeleton-loader>
          <v-skeleton-loader type="button"></v-skeleton-loader>
        </div>

        <div class="video-filter" v-else>
          <a href="https://tube.yt" class="home-link mb-4">
            <v-icon color="white" size="small">mdi-arrow-left</v-icon>
            <span>All channels</span>
          </a>

          <h1 class="channel-title">{{ channel.channelName }}</h1>
          <p class="text-caption mb-2">Last updated: {{ formatDate(channel.updatedAt) }}</p>

          <!-- Video count with total -->
          <p class="video-count mb-4">
            <span class="video-count__current">{{ filteredVideos.length }}</span>
            <span class="video-count__label">videos in selected period</span>
            <span v-if="shortsCount > 0" class="video-count__shorts">
              ({{ shortsCount }} Shorts hidden)
            </span>
          </p>

          <!-- Quick Filter Buttons -->
          <p class="filter-label mb-2">Quick filters:</p>
          <div class="quick-filters mb-4">
            <v-btn
              v-for="filter in quickFilters"
              :key="filter.label"
              :variant="isActiveFilter(filter) ? 'flat' : 'outlined'"
              :color="isActiveFilter(filter) ? 'white' : undefined"
              size="small"
              @click="applyQuickFilter(filter)"
              class="quick-filter-btn"
            >
              {{ filter.label }}
            </v-btn>
          </div>

          <!-- Custom Range -->
          <p class="filter-label mb-2">Custom range:</p>
          <v-row align="center" class="mb-4">
            <v-col cols="5">
              <v-number-input
                v-model="rangeNumber"
                :max="rangeConfig.max"
                :min="1"
                control-variant="stacked"
                hide-details
                density="compact"
                :label="rangeNumber === 999 ? '∞' : ''"
              ></v-number-input>
            </v-col>
            <v-col cols="7">
              <v-select
                v-model="rangeUnit"
                :items="['Week', 'Month', 'Year']"
                hide-details
                density="compact"
              ></v-select>
            </v-col>
          </v-row>

          <v-btn
            variant="tonal"
            color="white"
            :block="isMobile"
            @click="setAllTimeFilter"
            class="all-time-btn"
          >
            <v-icon icon="mdi-infinity" class="mr-2"></v-icon>
            All time
          </v-btn>
        </div>
      </v-col>

      <!-- Right Column - Video List -->
      <v-col cols="12" sm="5" md="6" lg="5" xl="5" offset-sm="1" offset-md="1" offset-lg="2" offset-xl="1">
        <!-- Loading Skeletons -->
        <div v-if="videosAreLoading" class="video-skeletons">
          <v-card v-for="n in 4" :key="n" class="mb-4 video-skeleton-card">
            <v-skeleton-loader type="image" height="180"></v-skeleton-loader>
          </v-card>
        </div>

        <!-- Error State -->
        <div v-else-if="error" class="error-state">
          <v-icon icon="mdi-alert-circle" size="64" color="white"></v-icon>
          <p>{{ error }}</p>
          <v-btn color="white" variant="outlined" @click="retryFetch">
            <v-icon icon="mdi-refresh" class="mr-2"></v-icon>
            Retry
          </v-btn>
        </div>

        <!-- Video List -->
        <template v-else>
          <div v-if="filteredVideos.length > 0" class="video-list">
            <v-virtual-scroll
              :items="filteredVideos"
              height="90vh"
              item-height="200"
            >
              <template v-slot:default="{ item, index }">
                <v-hover>
                  <template v-slot:default="{ isHovering, props }">
                    <v-card
                      v-bind="props"
                      :elevation="isHovering ? 8 : 2"
                      class="video-card mb-4"
                      :class="{ 'on-hover': isHovering }"
                      :style="{ animationDelay: `${index * 30}ms` }"
                      @click="openVideo(item.id)"
                      @keydown.enter="openVideo(item.id)"
                      tabindex="0"
                    >
                      <v-img
                        :src="item?.thumbnails?.maxres?.url || item?.thumbnails?.high?.url || item?.thumbnails?.default?.url"
                        :aspect-ratio="16/9"
                        cover
                        class="video-thumbnail"
                      >
                        <!-- View Count Badge -->
                        <div class="video-badge video-badge--views">
                          <v-icon icon="mdi-eye" size="small"></v-icon>
                          <span>{{ formatNumber(item.viewCount) }}</span>
                        </div>

                        <!-- Publish Date Badge -->
                        <div class="video-badge video-badge--date">
                          <v-icon icon="mdi-calendar" size="small"></v-icon>
                          <span>{{ formatRelativeDate(item.publishedAt) }}</span>
                        </div>

                        <!-- Video Title -->
                        <div class="video-title">
                          <span>{{ item.title }}</span>
                        </div>
                      </v-img>
                    </v-card>
                  </template>
                </v-hover>
              </template>
            </v-virtual-scroll>
          </div>

          <!-- No Videos State -->
          <div v-else class="no-videos">
            <v-icon icon="mdi-video-off" size="64" color="white" opacity="0.5"></v-icon>
            <p v-if="videos.length > 0 && filteredVideos.length === 0">
              All {{ videos.length }} videos are Shorts
            </p>
            <p v-else>No videos found for this time period</p>
            <v-btn color="white" variant="outlined" @click="setAllTimeFilter">
              Show all videos
            </v-btn>
          </div>
        </template>

        <!-- Back to Top Button -->
        <v-btn
          v-if="showBackToTop"
          icon
          color="white"
          class="back-to-top"
          @click="scrollToTop"
        >
          <v-icon icon="mdi-chevron-up"></v-icon>
        </v-btn>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue';
import axios from 'axios';
import { useDisplay } from 'vuetify';
import { getBaseUrl, getSubdomain, formatNumber, formatDate, type Video } from '@/utils';

interface ChannelInfo {
  id: string;
  channelName: string;
  updatedAt: string;
  subdomain: string;
}

interface DateFilter {
  days: number;
  weeks: number;
  months: number;
}

interface QuickFilter {
  label: string;
  unit: 'Week' | 'Month' | 'Year';
  value: number;
}

const STORAGE_KEY = 'tube-yt-filter';

const { width } = useDisplay();
const videos = ref<Video[]>([]);
const rangeUnit = ref<'Week' | 'Month' | 'Year'>('Month');
const rangeNumber = ref(1);
const isMobile = computed(() => width.value < 600);
const subdomain = ref('');
const channel = ref<ChannelInfo>({} as ChannelInfo);
const videosAreLoading = ref(true);
const channelIsLoading = ref(true);
const error = ref('');
const showBackToTop = ref(false);

// Filter Shorts by duration (< 60 seconds)
const isShort = (video: Video): boolean => {
  return video.duration > 0 && video.duration < 60;
};

const shortsCount = computed(() => {
  return videos.value.filter(v => isShort(v)).length;
});

const filteredVideos = computed(() => {
  return videos.value.filter(v => !isShort(v));
});

const quickFilters: QuickFilter[] = [
  { label: 'Week', unit: 'Week', value: 1 },
  { label: 'Month', unit: 'Month', value: 1 },
  { label: '3 Months', unit: 'Month', value: 3 },
  { label: 'Year', unit: 'Year', value: 1 },
];

const rangeConfig = computed(() => {
  switch (rangeUnit.value) {
    case 'Week': return { max: 52 };
    case 'Month': return { max: 12 };
    case 'Year': return { max: 10 };
  }
});

const dateFilter = computed<DateFilter>(() => {
  const n = Math.min(rangeNumber.value, rangeConfig.value.max);
  switch (rangeUnit.value) {
    case 'Week': return { days: 0, weeks: n, months: 0 };
    case 'Month': return { days: 0, weeks: 0, months: n };
    case 'Year': return { days: 0, weeks: 0, months: n * 12 };
  }
});

const isActiveFilter = (filter: QuickFilter) => {
  return rangeUnit.value === filter.unit && rangeNumber.value === filter.value;
};

const applyQuickFilter = (filter: QuickFilter) => {
  rangeUnit.value = filter.unit;
  rangeNumber.value = filter.value;
};

const formatRelativeDate = (dateStr: string) => {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`;
  return `${Math.floor(diffDays / 365)}y ago`;
};

const saveFilterPreference = () => {
  const preference = {
    unit: rangeUnit.value,
    number: rangeNumber.value
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(preference));
};

const loadFilterPreference = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const { unit, number } = JSON.parse(saved);
      rangeUnit.value = unit;
      rangeNumber.value = number;
      return true;
    }
  } catch (e) {
    console.error('Failed to load filter preference:', e);
  }
  return false;
};

const fetchChannel = async () => {
  const baseUrl = getBaseUrl(subdomain.value);
  try {
    const response = await axios.get(`${baseUrl}/channels/${subdomain.value}`);
    return response.data.channel;
  } catch (err: any) {
    console.error('Error fetching channel:', err.message);
    error.value = 'Failed to load channel information';
    throw err;
  }
};

const fetchVideos = async (filter: DateFilter) => {
  videosAreLoading.value = true;
  error.value = '';

  let fromDate = new Date();
  const { days, weeks, months } = filter;

  if (days) {
    fromDate.setDate(fromDate.getDate() - days);
  } else if (weeks) {
    fromDate.setDate(fromDate.getDate() - weeks * 7);
  } else if (months) {
    fromDate.setMonth(fromDate.getMonth() - months);
  }

  const baseUrl = getBaseUrl(subdomain.value);

  try {
    const response = await axios.get(`${baseUrl}/videos`, {
      params: {
        fromdate: fromDate.toISOString(),
        channel: subdomain.value,
      },
    });
    videos.value = response.data.fromDateVideos.map((video: any) => ({
      ...video,
      thumbnails: JSON.parse(video.thumbnails),
    }));
  } catch (err) {
    console.error('Error fetching videos:', err);
    error.value = 'Failed to load videos. Please try again.';
  } finally {
    videosAreLoading.value = false;
  }
};

const retryFetch = () => {
  fetchVideos(dateFilter.value);
};

const setAllTimeFilter = () => {
  rangeNumber.value = 999;
};

const openVideo = (videoId: string) => {
  window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
};

const scrollToTop = () => {
  const scrollContainer = document.querySelector('.v-virtual-scroll');
  if (scrollContainer) {
    scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

const handleScroll = () => {
  const scrollContainer = document.querySelector('.v-virtual-scroll');
  if (scrollContainer) {
    showBackToTop.value = scrollContainer.scrollTop > 400;
  }
};

// Clamp rangeNumber when unit changes
watch(rangeUnit, () => {
  if (rangeNumber.value > rangeConfig.value.max && rangeNumber.value !== 999) {
    rangeNumber.value = rangeConfig.value.max;
  }
});

// Fetch videos and save preference when filter changes
watch(dateFilter, (newFilter) => {
  fetchVideos(newFilter);
  saveFilterPreference();
}, { deep: true });

onMounted(async () => {
  subdomain.value = getSubdomain();

  try {
    channel.value = await fetchChannel();
    channelIsLoading.value = false;

    // Load saved preference or use default
    const hasPreference = loadFilterPreference();

    if (!hasPreference) {
      await fetchVideos({ days: 0, weeks: 0, months: 1 });
      if (videos.value.length < 3) {
        rangeNumber.value = 3;
      }
    }
  } catch (e) {
    channelIsLoading.value = false;
  }

  // Add scroll listener for back to top button
  setTimeout(() => {
    const scrollContainer = document.querySelector('.v-virtual-scroll');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
    }
  }, 100);
});

onUnmounted(() => {
  const scrollContainer = document.querySelector('.v-virtual-scroll');
  if (scrollContainer) {
    scrollContainer.removeEventListener('scroll', handleScroll);
  }
});
</script>

<style scoped>
.subdomain-container {
  padding-top: 24px;
}

.filter-skeleton {
  padding: 16px;
}

.video-filter {
  position: sticky;
  top: 24px;
}

.home-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: white;
  text-decoration: none;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.home-link:hover {
  opacity: 1;
}

.channel-title {
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
  margin-bottom: 8px;
}

.video-count {
  display: flex;
  flex-direction: column;
}

.video-count__current {
  font-size: 2rem;
  font-weight: 700;
  line-height: 1;
}

.video-count__label {
  font-size: 0.85rem;
  opacity: 0.8;
}

.video-count__shorts {
  font-size: 0.75rem;
  opacity: 0.6;
}

.filter-label {
  font-size: 0.85rem;
  opacity: 0.8;
}

.quick-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.quick-filter-btn {
  text-transform: none;
}

.all-time-btn {
  text-transform: none;
}

.video-skeletons {
  padding-top: 8px;
}

.video-skeleton-card {
  border-radius: 12px;
  overflow: hidden;
}

.video-list {
  height: 90vh;
}

.video-card {
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  background-color: black;
  transition: all 0.2s ease;
  animation: fadeIn 0.3s ease forwards;
  opacity: 0;
}

@keyframes fadeIn {
  to {
    opacity: 1;
  }
}

.video-card:focus {
  outline: 2px solid white;
  outline-offset: 2px;
}

.video-card.on-hover {
  transform: scale(1.02);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
}

.video-thumbnail {
  position: relative;
}

.video-badge {
  position: absolute;
  background-color: rgba(0, 0, 0, 0.75);
  padding: 4px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.85rem;
  color: white;
}

.video-badge--views {
  bottom: 8px;
  right: 8px;
}

.video-badge--date {
  top: 8px;
  right: 8px;
}

.video-title {
  position: absolute;
  bottom: 8px;
  left: 8px;
  right: 80px;
  background-color: rgba(0, 0, 0, 0.75);
  padding: 6px 10px;
  border-radius: 4px;
  color: white;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.error-state,
.no-videos {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 48px;
  text-align: center;
  min-height: 50vh;
}

.back-to-top {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 100;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

@media only screen and (max-width: 599px) {
  .video-filter {
    position: relative;
    top: 0;
    margin-bottom: 24px;
  }

  .channel-title {
    font-size: 1.3rem;
  }

  .video-list {
    height: 60vh;
  }

  .video-count__current {
    font-size: 1.5rem;
  }
}
</style>
