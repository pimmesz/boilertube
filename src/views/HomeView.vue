<template>
	<h1>HOME</h1>
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
		const subdomain = ref('');
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
				? "https://tube.yt"
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
</style>
