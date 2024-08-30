<template>
	<v-container class="fill-height">
		<v-row no-gutters>
			<v-col
				cols="12"
				sm="5"
				offset-sm="1"
				md="3"
				offset-md="1"
				lg="2"
				offset-lg="1"
				xl="2"
				offset-xl="1"
			>
				<div class="video-filter">
					<h1>{{ subdomain }}</h1>
					<p class="has-margin-bottom-16">
						Most viewed {{ subdomain }} Youtube videos in:
					</p>
					<div class="selector-divider">
						<v-number-input
						v-model="customRangeNumberInput"
						control-variant="stacked"
						reverse
						:max="customRangeMax"
						:min="customRangeMin"
						inset
					></v-number-input>
						<v-select
							label="Select"
							v-model="customRangeDateInput"
							:items="['Week', 'Month', 'Year']"
							variant="outlined"
							:item-title="customRangeDateInput"
							:item-value="customRangeDateInput"
						></v-select>
					</div>
					<v-btn
						variant="outlined"
						class="has-margin-bottom-16"
						:block="isMobile"
						@click="
							videoFilterDate = { days: 0, weeks: 0, months: 999 }
						"
						>Most viewed videos ever
					</v-btn>
				</div>
			</v-col>
			<v-col
				cols="12"
				sm="4"
				offset-sm="2"
				md="5"
				offset-md="3"
				lg="5"
				offset-lg="3"
				xl="5"
				offset-xl="2"
				class="has-margin-bottom-16"
			>
				<div class="infinite-scroll" v-if="videos?.length > 0">
					<div :class="videos?.length > 3 ? 'video-list' : ''" v-if="!videosAreLoading">
						<v-virtual-scroll
							:height="1500"
							:items="videos"
						>
							<template v-slot:default="{ item }">
								<a
									:href="`https://www.youtube.com/watch?v=${item?.id}`"
									target="_blank"
									class="video-link"
								>
									<img
										:src="item?.thumbnails.high.url"
										alt=""
										class="video-link__image"
									/>
									<div class="video-link__text">
										<p>{{ getHumanReadableNumber(item?.viewCount) }} views</p>
									</div>
								</a>
							</template>
						</v-virtual-scroll>
					</div>
					<v-progress-circular
							color="white"
							indeterminate
							style="position: absolute; top: 50%; left: 50%;"
							v-else
					></v-progress-circular>
				</div>
				<div v-else>
					<h1>No videos for {{ subdomain }} yet...</h1>
				</div>
			</v-col>
		</v-row>
	</v-container>
</template>

<script lang="ts">
import Spinner from "../components/Spinner.vue";
import { ref } from "vue";
import axios from "axios";
import numeral from "numeral";
import { useDisplay } from "vuetify";
import Datepicker from "@vuepic/vue-datepicker";
import "@vuepic/vue-datepicker/dist/main.css";

export default {
	components: {
		Spinner,
		Datepicker,
	},
	setup() {
		const { width } = useDisplay();
		const videos = ref({});
		const customRangeDateInput = ref('Month');
		const customRangeMax = ref(12);
		const customRangeMin = ref(1);
		const customRangeNumberInput = ref(1);
		const isMobile = ref(width.value < 600);
		const items = ref([]);
		const subdomain = ref('');
		const videoFilterDate = ref({ days: 0, weeks: 0, months: 1 });
		const videosAreLoading = ref(false);

		return {
			videos,
			customRangeDateInput,
			customRangeMax,
			customRangeMin,
			customRangeNumberInput,
			isMobile,
			items,
			subdomain,
			videoFilterDate,
			videosAreLoading
		};
	},
	created() {
		this.subdomain = this.getSubdomain();
		this.fetchVideos({ days: 0, weeks: 0, months: 1 });
	},
	watch: {
		// whenever videoFilterDate changes, this function will run
		videoFilterDate(newVideoFilterDate) {
			this.fetchVideos(newVideoFilterDate);
		},
		// whenever customRangeDateInput changes, this function will run
		customRangeDateInput(newCustomRangeDateInput) {
			switch (newCustomRangeDateInput) {
				case 'Week':
					this.customRangeMax = 52;
					this.customRangeMin = 1;
					this.videoFilterDate = { days: 0, weeks: this.customRangeNumberInput, months: 0 }
					break;
				case 'Month':
					this.customRangeMax = 12;
					this.customRangeMin = 1;
					this.videoFilterDate = { days: 0, weeks: 0, months: this.customRangeNumberInput }
					break;
				case 'Year':
					this.customRangeMax = 10;
					this.customRangeMin = 1;
					this.videoFilterDate = { days: 0, weeks: 0, months: this.customRangeNumberInput * 12 }
					break;
			}

			// If the input is greater than the max, set it to the max
			if (this.customRangeNumberInput > this.customRangeMax) {
				this.customRangeNumberInput = this.customRangeMax;
			}
		},
		// whenever customRangeNumberInput changes, this function will run
		customRangeNumberInput(newCustomRangeNumberInput) {
			switch (this.customRangeDateInput) {
				case 'Week':
					this.videoFilterDate = { days: 0, weeks: newCustomRangeNumberInput, months: 0 }
					break;
				case 'Month':
					this.videoFilterDate = { days: 0, weeks: 0, months: newCustomRangeNumberInput }
					break;
				case 'Year':
					this.videoFilterDate = { days: 0, weeks: 0, months: newCustomRangeNumberInput * 12 }
					break;
			}
		},
	},
	methods: {
		getHumanReadableNumber(number: number) {
			return numeral(number).format("0,0a");
		},
    getSubdomain(): string {
			if (import.meta.env.VITE_ENVIRONMENT === "local") {
				return 'boilerroom'
			}
      const host = window.location.hostname;
      const parts = host.split(".");
      if (parts.length > 2) {
        return parts[0];
      }
      return '';
    },
		fetchVideos(
			dateObject = { days: 0, weeks: 0, months: 0 }
		) {
			this.videosAreLoading = true;
			let fromDate = new Date();
			const { days, weeks, months } = dateObject;
			// Per day
			if (days && !weeks && !months) {
				fromDate.setDate(fromDate.getDate() - days);
				fromDate.toISOString();
			}

			// Per week
			if (!days && weeks && !months) {
				fromDate.setDate(fromDate.getDate() - weeks * 7);
				fromDate.toISOString();
			}

			// Per month
			if (!days && !weeks && months) {
				fromDate.setMonth(fromDate.getMonth() - months);
				fromDate.toISOString();
			}

			const baseUrl = import.meta.env.VITE_ENVIRONMENT === "production"
				? "https://tube.yt"
				: "http://localhost:3003";

			axios
				.get(`${baseUrl}/videos`, {
					params: {
						fromdate: fromDate,
						channel: this.subdomain,
					},
				})
				.then((response) => {
					const data = response.data.fromDateVideos;
					data.forEach(
						(video: any) => (video.thumbnails = JSON.parse(video.thumbnails))
					);
					this.videos = data;
					this.videosAreLoading = false;
				})
				.catch((error) => {
					console.log(error);
					this.videosAreLoading = false;
				});
		},
	},
};
</script>

<style scoped>
.video-filter {
	@media only screen and (min-width: 600px) {
		/* position: fixed;
		top: 40%; */
	}
}

.infinite-scroll {
	@media only screen and (min-width: 600px) {
		position: fixed;
		top: 76px;
		height: 90vh;
		overflow: hidden;
	}
}

.video-list::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 20px; /* Adjust height based on your design */
  pointer-events: none; /* Ensures the shadow doesn't block interaction with items */
  background: linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(255,255,255, 0.8));
}

.video-link {
	color: white;
	text-decoration: none;
	position: relative;
	display: block;
	transform: scale(1);
	transition: all 0.2s ease-in-out;
}

.video-link:hover {
	transform: scale(1.01);
	transition: all 0.2s ease-in-out;
}

.video-link__image {
	transition: all 0.2s ease-in-out;
	box-shadow: rgba(0, 0, 0, 0.35) 0px 5px 15px;
	width: 100%;
}

.video-link__image:hover {
	transition: all 0.2s ease-in-out;
	box-shadow: rgba(0, 0, 0, 0.6) 0px 5px 20px;
}

.video-link__text {
	font-size: 1rem;
	font-weight: 500;
	margin-top: 0.5rem;
	position: absolute;
	top: 0;
	left: 10px;
}

.selector-divider {
	display: flex;
	justify-content: space-between;
	margin-top: 1rem;
}

/* Overrule Vuetify */
.v-number-input {
	max-width: 100px;
	margin-right: 20px;
}
	
</style>
