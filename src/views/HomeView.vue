<template>
	<v-container class="fill-height flex flex--center">
		<v-row no-gutters>
			<v-col
				cols="8"
				offset="2"
				sm="4"
				offset-sm="0"
				md="3"
				offset-md="0"
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
					@click="getVideosFromDate(0, 0, 1), (activeButton = 0)"
					>past month</v-btn
				>
				<v-btn
					variant="outlined"
					:block="isMobile"
					:disabled="activeButton === 1"
					@click="getVideosFromDate(0, 0, 6), (activeButton = 1)"
					>past six months</v-btn
				>
				<Datepicker
					class="has-margin-bottom-16"
					v-model="rangeDate"
					month-picker
					range
				></Datepicker>
			</v-col>
			<v-col
				cols="8"
				offset="2"
				sm="6"
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
		const rangeDate = ref();

		return { boilerRoomVideos, isMobile, activeButton, rangeDate };
	},
	created() {
		this.getVideosFromDate(0, 0, 1);
	},
	watch: {
		// whenever question changes, this function will run
		rangeDate(newRangeDate, oldRangeDate) {
			this.activeButton = -1;
			this.getVideosBetweenDates(newRangeDate);
		},
	},
	methods: {
		getHumanReadableNumber(number: number) {
			return numeral(number).format("0,0a");
		},
		getVideosFromDate(days = 0, weeks = 0, months = 0) {
			let fromDate = new Date();
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

			axios
				.get("https://boilertube.pim.gg/boilerroom-videos", {
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
				})
				.catch((error) => {
					console.log(error);
				});
		},
		getVideosBetweenDates(rangeDates) {
			let toDate = new Date(rangeDates[1].year, rangeDates[1].month, 1);
			let fromDate = new Date(rangeDates[0].year, rangeDates[0].month, 1);

			axios
				.get("http://localhost:3003/boilerroom-videos", {
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
