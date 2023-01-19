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
				:class="{ fixed: !isMobile }"
			>
				<h1>BoilerTube</h1>
				<p class="has-margin-bottom-16">
					Most viewed Boilerroom Youtube videos in:
				</p>
				<v-btn
					variant="outlined"
					:disabled="activeButton === 0"
					:block="isMobile"
					@click="
						(videoFilterDate = { days: 0, weeks: 0, months: 1 }),
							(activeButton = 0)
					"
					>past month</v-btn
				>
				<v-btn
					variant="outlined"
					:block="isMobile"
					:disabled="activeButton === 1"
					@click="
						(videoFilterDate = { days: 0, weeks: 0, months: 6 }),
							(activeButton = 1)
					"
					>past six months</v-btn
				>
				<v-btn
					variant="outlined"
					:block="isMobile"
					:disabled="activeButton === 2"
					@click="
						(videoFilterDate = { days: 0, weeks: 0, months: 999 }),
							(activeButton = 2)
					"
					>ever
				</v-btn>
				<Datepicker
					class="has-margin-bottom-16"
					v-model="rangeDate"
					placeholder="Select a Date Range"
					month-picker
					range
				></Datepicker>
				<div>
					<v-combobox
						v-model="chips"
						:items="items"
						chips
						clearable
						label="Filter genres"
						multiple
						variant="solo"
					>
						<template v-slot:selection="{ attrs, item, select, selected }">
							<v-chip
								v-bind="attrs"
								:model-value="selected"
								closable
								@click="select"
								@click:close="remove(item)"
							>
								<strong>{{ item }}</strong
								>&nbsp;
								<span>(interest)</span>
							</v-chip>
						</template>
					</v-combobox>
				</div>
			</v-col>
			<v-col
				cols="8"
				offset="2"
				sm="4"
				offset-sm="6"
				class="has-margin-bottom-16"
				v-for="video in boilerRoomVideos"
			>
				<a
					:href="`https://www.youtube.com/watch?v=${video?.id}`"
					target="_blank"
					class="video-link"
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
		const activeButton = ref(0);
		const videoFilterDate = ref({ days: 0, weeks: 0, months: 1 });
		const rangeDate = ref();
		const chips = ref([]);
		const items = ref([]);

		return {
			boilerRoomVideos,
			isMobile,
			activeButton,
			videoFilterDate,
			rangeDate,
			chips,
			items,
		};
	},
	created() {
		this.fetchVideos({ days: 0, weeks: 0, months: 1 });
		this.fetchGenres();
	},
	watch: {
		// whenever question changes, this function will run
		rangeDate(newRangeDate) {
			this.activeButton = -1;
			this.fetchVideosBetweenDates(newRangeDate);
		},
		// whenever question changes, this function will run
		chips(newChips) {
			this.fetchVideos(this.videoFilterDate, newChips);
		},
		videoFilterDate(newVideoFilterDate) {
			this.fetchVideos(newVideoFilterDate, this.chips);
		},
	},
	methods: {
		getHumanReadableNumber(number: number) {
			return numeral(number).format("0,0a");
		},
		fetchGenres() {
			axios
				.get("https://boilertube.pim.gg/get-genres")
				.then((response) => {
					const genres = response.data.genres;
					this.items = genres;
				})
				.catch((error) => {
					console.log(error);
				});
		},
		fetchVideos(
			dateObject = { days: 0, weeks: 0, months: 0 },
			selectedGenres = []
		) {
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
			axios
				.get("https://boilertube.pim.gg/boilerroom-videos", {
					params: {
						fromdate: fromDate,
					},
				})
				.then((response) => {
					let data = response.data.fromDateVideos;

					if (selectedGenres.length > 0) {
						data = data
							.map((video) => {
								if (!video.genres) return;
								const videoGenres = JSON.parse(video.genres).split(",");
								if (
									!video.genres ||
									videoGenres.some((genre: string) =>
										selectedGenres.includes(genre)
									)
								) {
									return video;
								}
							})
							.filter((video) => video);
					}

					data.forEach(
						(video: any) => (video.thumbnails = JSON.parse(video.thumbnails))
					);
					this.boilerRoomVideos = data;
				})
				.catch((error) => {
					console.log(error);
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
</style>
