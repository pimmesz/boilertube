<template>
	<v-container class="fill-height">
		<v-row no-gutters>
			<v-col
				cols="8"
				offset="2"
				sm="4"
				offset-sm="0"
				md="3"
				offset-md="1"
				lg="2"
				offset-lg="1"
			>
				<div style="position: fixed; top: 40%;">
					<h1>BoilerTube</h1>
					<p class="has-margin-bottom-16">
						Most viewed Boilerroom Youtube videos in:
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
							:items="['Day', 'Week', 'Month', 'Year']"
							variant="outlined"
							:item-title="customRangeDateInput"
							:item-value="customRangeDateInput"
							style="display: block"
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
				cols="5"
				offset="2"
				class="has-margin-bottom-16"
			>
				<div style="position: sticky; top: 76px; height: 100vh;">
					<a
						:href="`https://www.youtube.com/watch?v=${video?.id}`"
						target="_blank"
						class="video-link"
						v-for="video in boilerRoomVideos"
						v-if="!videosAreLoading"
					>
						<img
							:src="video?.thumbnails.high.url"
							alt=""
							class="video-link__image"
						/>
						<div class="video-link__text">
							<p>{{ getHumanReadableNumber(video?.viewCount) }} views</p>
						</div>
					</a>
					<v-progress-circular
							color="white"
							indeterminate
							style="position: absolute; top: 50%; left: 50%;"
							v-else
					></v-progress-circular>
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
		const boilerRoomVideos = ref({});
		const { width } = useDisplay();
		const isMobile = ref(width.value < 600);
		const videoFilterDate = ref({ days: 0, weeks: 0, months: 1 });
		const items = ref([]);
		const customRangeDateInput = ref('Month');
		const customRangeNumberInput = ref(1);
		const customRangeMax = ref(12);
		const customRangeMin = ref(1);
		const videosAreLoading = ref(false);

		return {
			boilerRoomVideos,
			isMobile,
			videoFilterDate,
			items,
			customRangeDateInput,
			customRangeNumberInput,
			customRangeMax,
			customRangeMin,
			videosAreLoading
		};
	},
	created() {
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
				case 'Day':
					this.customRangeMax = 31;
					this.customRangeMin = 1;
					this.videoFilterDate = { days: this.customRangeNumberInput, weeks: 0, months: 0 }
					break;
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
				case 'Day':
					this.videoFilterDate = { days: newCustomRangeNumberInput, weeks: 0, months: 0 }
					break;
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

			// https://boilertube.pim.gg
			const baseUrl = import.meta.env.VITE_ENVIRONMENT === "production"
				? "https://boilertube.pim.gg"
				: "http://localhost:3003";

			axios
				.get(`${baseUrl}/boilerroom-videos`, {
					params: {
						fromdate: fromDate,
					},
				})
				.then((response) => {
					const data = response.data.fromDateVideos;
					data.forEach(
						(video: any) => (video.thumbnails = JSON.parse(video.thumbnails))
					);
					this.boilerRoomVideos = data;
					this.videosAreLoading = false;
				})
				.catch((error) => {
					console.log(error);
					this.videosAreLoading = false;
				});
		},
		fetchVideosBetweenDates(rangeDates: any) {
			let toDate = new Date(rangeDates[1].year, rangeDates[1].month, 1);
			let fromDate = new Date(rangeDates[0].year, rangeDates[0].month, 1);

			axios
				.get("https://boilertube.pim.gg/boilerroom-videos", {
					params: {
						fromdate: fromDate,
						todate: toDate,
					},
				})
				.then((response) => {
					const data = response.data.betweenDateVideos;
					data.forEach(
						(video: any) => (video.thumbnails = JSON.parse(video.thumbnails))
					);
					this.boilerRoomVideos = data;
				})
				.catch((error) => {
					console.log(error);
				});
		},
	},
};
</script>

<style scoped>
.fixed {
	position: fixed;
	height: 100%;
	display: flex;
	flex-direction: column;
	justify-content: center;
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

.dp__overlay_cell_disabled {
	color: gray;
}
.dp__overlay_cell_disabled:hover {
	color: gray;
}

.selector-divider {
	display: flex;
	justify-content: space-between;
	margin-top: 1rem;
}
</style>
