<template>
	<v-container class="fill-height flex flex--center">
		<v-row no-gutters>
			<div class="fixed">
				<h1>BoilerTube</h1>
				<p class="has-margin-bottom-16">
					Most viewed Boilerroom Youtube videos in:
				</p>
				<!-- <v-btn variant="outlined" @click="getVideos(0, 1, 0)">past week</v-btn> -->
				<v-btn variant="outlined" @click="getVideos(0, 0, 1)">past month</v-btn>
				<v-btn variant="outlined" @click="getVideos(0, 0, 6)"
					>past six months</v-btn
				>
			</div>
			<v-col
				cols="12"
				sm="6"
				offset-sm="4"
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

export default {
	components: {
		Spinner,
	},
	setup() {
		const boilerRoomVideos = ref({});

		return { boilerRoomVideos };
	},
	created() {
		this.getVideos(0, 0, 1);
	},
	methods: {
		getHumanReadableNumber(number: number) {
			return numeral(number).format("0,0a");
		},
		getVideos(days = 0, weeks = 0, months = 0) {
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
