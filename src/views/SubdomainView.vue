<template>
  <v-container class="fill-height">
    <v-row no-gutters>
      <v-col cols="12" sm="5" md="4" lg="3" xl="3" offset-sm="1" offset-md="1" offset-lg="2" offset-xl="2">
				<a href="https://tube.yt" class="mb-4" v-if="!channelIsLoading">
					<v-icon color="white" small>mdi-home</v-icon>
				</a>
        <div class="video-filter" v-if="!channelIsLoading">
					<h1>{{ channel.channelName }}</h1>
					<p class="text-caption">Last updated: {{ formatDate(channel.updatedAt) }}</p>
					<p class="mb-4 text-caption">Filtered results: {{ videos.length }}</p>
					<p class="mb-4">Most viewed {{ subdomain }} Youtube videos in:</p>
					<v-row align="center" class="mb-4">
						<v-col cols="5">
							<v-number-input
								v-model="customRangeNumberInput"
								:max="customRangeMax"
								:min="customRangeMin"
								control-variant="stacked"
								hide-details
								density="compact"
								:label="customRangeNumberInput === 999 ? '∞' : ''"
							></v-number-input>
						</v-col>
						<v-col cols="7">
							<v-select
								v-model="customRangeDateInput"
								:items="['Week', 'Month', 'Year']"
								hide-details
								density="compact"
							></v-select>
						</v-col>
					</v-row>
					<v-btn
						variant="outlined"
						:block="isMobile"
						@click="setAllTimeFilter"
						class="mb-4"
					>
						Most viewed videos ever
					</v-btn>
        </div>
      </v-col>
      <v-col cols="12" sm="5" md="6" lg="5" xl="5" offset-sm="1" offset-md="1" offset-lg="2" offset-xl="1">
        <v-progress-circular
          v-if="videosAreLoading"
          color="white"
          indeterminate
          size="64"
          class="loading-spinner"
        ></v-progress-circular>
        <template v-else>
          <div v-if="videos.length > 0" class="infinite-scroll">
            <v-virtual-scroll
              :items="videos"
              height="90vh"
              item-height="200"
            >
              <template v-slot:default="{ item }">
                <v-hover>
                  <template v-slot:default="{ isHovering, props }">
                    <v-card
                      v-bind="props"
                      :elevation="isHovering ? 8 : 2"
											class="mb-4"
                      :class="{ 'on-hover': isHovering }"
											style="background-color: black;"
                      @click="openVideo(item.id)"
                    >
                      <v-img
                        :src="item?.thumbnails?.maxres?.url || item?.thumbnails?.high?.url || item?.thumbnails?.default?.url"
                        :aspect-ratio="16/9"
                        cover
                      >
                        <div class="view-count">
                          <v-icon icon="mdi-eye" size="small" color="white" class="mr-1"></v-icon>
                          <span style="color: white;">{{ getHumanReadableNumber(item.viewCount) }}</span>
                        </div>
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
          <v-alert
            v-if="videos.length < 0 && !videosAreLoading"
            type="info"
            prominent
            border="start"
            class="mt-4"
          >
            No videos for {{ subdomain }} yet...
          </v-alert>
        </template>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import axios from 'axios';
import numeral from 'numeral';
import { useDisplay } from 'vuetify';

const { width } = useDisplay();
const videos = ref([]);
const customRangeDateInput = ref('Month');
const customRangeMax = ref(12);
const customRangeMin = ref(1);
const customRangeNumberInput = ref(1);
const isMobile = computed(() => width.value < 600);
const subdomain = ref('');
const channel = ref({});
const videoFilterDate = ref({ days: 0, weeks: 0, months: 1 });
const videosAreLoading = ref(true);
const channelIsLoading = ref(true);

const getHumanReadableNumber = (number: number) => {
  return numeral(number).format('0.0a');
};

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const getSubdomain = (): string => {
  if (import.meta.env.VITE_ENVIRONMENT === 'local') {
    return 'intercell';
  }
  const host = window.location.hostname;
  const parts = host.split('.');
  return parts.length > 2 ? parts[0] : '';
};

const fetchChannel = async () => {
  const baseUrl = import.meta.env.VITE_ENVIRONMENT === 'production'
    ? `https://${subdomain.value}.tube.yt`
    : 'http://localhost:3003';

  try {
    const response = await axios.get(`${baseUrl}/channels/${subdomain.value}`);
    console.log('Current channel:', response.data.channel.channelName, response.data.channel.id);
    return response.data.channel;
  } catch (error) {
    console.error('Error fetching channel:', error.message);
  }
};

const fetchVideos = async (dateObject = { days: 0, weeks: 0, months: 0 }) => {
	videosAreLoading.value = true;
  channelIsLoading.value = true;
  let fromDate = new Date();
  const { days, weeks, months } = dateObject;

  if (days && !weeks && !months) {
    fromDate.setDate(fromDate.getDate() - days);
  } else if (!days && weeks && !months) {
    fromDate.setDate(fromDate.getDate() - weeks * 7);
  } else if (!days && !weeks && months) {
    fromDate.setMonth(fromDate.getMonth() - months);
  }

  const baseUrl = import.meta.env.VITE_ENVIRONMENT === 'production'
    ? `https://${subdomain.value}.tube.yt`
    : 'http://localhost:3003';

  try {
    const response = await axios.get(`${baseUrl}/videos`, {
      params: {
        fromdate: fromDate.toISOString(),
        channel: subdomain.value,
      },
    });
    const data = response.data.fromDateVideos;
    videos.value = data.map((video: any) => ({
      ...video,
      thumbnails: JSON.parse(video.thumbnails),
    }));
  } catch (error) {
    console.error('Error fetching videos:', error);
  } finally {
    videosAreLoading.value = false;
    channelIsLoading.value = false;
  }
};

const setAllTimeFilter = () => {
  videoFilterDate.value = { days: 0, weeks: 0, months: 999 };
  customRangeMax.value = 999;
  customRangeNumberInput.value = 999;
};

const openVideo = (videoId: string) => {
  window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
};

watch(videoFilterDate, (newValue) => {
  fetchVideos(newValue);
});

watch(customRangeDateInput, (newValue) => {
  switch (newValue) {
    case 'Week':
      customRangeMax.value = 52;
      customRangeMin.value = 1;
      videoFilterDate.value = { days: 0, weeks: customRangeNumberInput.value, months: 0 };
      break;
    case 'Month':
      customRangeMax.value = 12;
      customRangeMin.value = 1;
      videoFilterDate.value = { days: 0, weeks: 0, months: customRangeNumberInput.value };
      break;
    case 'Year':
      customRangeMax.value = 10;
      customRangeMin.value = 1;
      videoFilterDate.value = { days: 0, weeks: 0, months: customRangeNumberInput.value * 12 };
      break;
  }
});

watch(customRangeNumberInput, (newValue) => {
  switch (customRangeDateInput.value) {
    case 'Week':
      if (newValue === 998) {
        customRangeNumberInput.value = 52;
      }
      videoFilterDate.value = { days: 0, weeks: newValue, months: 0 };
      break;
    case 'Month':
      if (newValue === 998) {
        customRangeNumberInput.value = 12;
      }
      videoFilterDate.value = { days: 0, weeks: 0, months: newValue };
      break;
    case 'Year':
      if (newValue === 998) {
        customRangeNumberInput.value = 10;
      }
      videoFilterDate.value = { days: 0, weeks: 0, months: newValue * 12 };
      break;
  }
});

onMounted(async () => {
  subdomain.value = getSubdomain();
  channel.value = await fetchChannel();
  await fetchVideos({ days: 0, weeks: 0, months: 1 });
	if (videos.value.length < 3) {
		await fetchVideos({ days: 0, weeks: 0, months: 3 });
		customRangeNumberInput.value = 3;
	}
});
</script>

<style scoped>
@media only screen and (max-width: 599px) {
}

@media only screen and (min-width: 600px) {
	.video-filter {
		position: sticky;
		top: 50%;
		transform: translateY(-50%);
	}
}

.infinite-scroll {
  height: 90vh;
  overflow-y: auto;
  box-shadow: inset 0 -10px 10px -10px rgba(0,0,0,0.1);
}

.v-card {
  transition: all 0.3s ease-in-out;
  transform: scale(1);
}

.on-hover {
  box-shadow: 0 0 20px 0 rgba(0, 0, 0, 0.2);
  transform: scale(1.02);
}

@media only screen and (max-width: 599px) {
  .infinite-scroll {
    height: 60vh;
  }
}

.text-truncate {
	white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.view-count {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background-color: rgba(0, 0, 0, 0.6);
  padding: 4px 8px;
  border-radius: 4px;
  display: flex;
  align-items: center;
}

.video-title {
	color: white;
	position: absolute;
	bottom: 8px;
	left: 8px;
	background-color: rgba(0, 0, 0, 0.6);
	padding: 4px 8px;
	border-radius: 4px;
	max-width: 70%;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}

.loading-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}
</style>
