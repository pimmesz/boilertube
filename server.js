import express from "express";
import http from "http";
import axios from "axios";
import path from "path";
import bodyParser from "body-parser";
import cors from "cors";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3003;

app.use(express.static(__dirname + "/dist"));
app.use(bodyParser.json());
app.use(cors());

app.get("/*", (req, res) => res.sendFile(path.join(__dirname)));

dotenv.config();

// Endpoints
app.get("/boilerroom-videos", async (req, res, next) => {
	const fromDate = req.query.fromdate;
	const toDate = req.query.todate;

	console.log(fromDate, toDate);

	if (fromDate && toDate) {
		const betweenDateVideos = await getAllVideosBetweenDates(fromDate, toDate);

		res.send(
			JSON.stringify({
				betweenDateVideos,
			})
		);
		return;
	}

	if (fromDate) {
		const fromDateVideos = await getAllVideosBetweenDates(fromDate);

		res.send(
			JSON.stringify({
				fromDateVideos,
			})
		);
		return;
	}
});

// Functions
async function getAllVideosBetweenDates(
	fromDate = undefined,
	toDate = undefined
) {
	const videos = await prisma.video.findMany({
		where: {
			publishedAt: {
				lte: toDate,
				gte: fromDate,
			},
		},
	});

	// Sort videos by view count
	return videos
		.sort((a, b) => {
			return b.viewCount - a.viewCount;
		})
		.filter((video) => Number(video.viewCount) !== 0);
}

async function getVideoDetails(videoId) {
	try {
		const response = await axios.get(
			`https://youtube.googleapis.com/youtube/v3/videos?part=statistics&part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
		);

		const videoDetails = response.data.items[0];

		return {
			id: videoDetails.id,
			publishedAt: videoDetails.snippet.publishedAt,
			title: videoDetails.snippet.title,
			thumbnails: JSON.stringify(videoDetails.snippet.thumbnails),
			viewCount: videoDetails.statistics.viewCount,
		};
	} catch (error) {
		console.log(error);
	}
}

function getCountYoutubeVideos() {
	return axios.get(
		"https://youtube.googleapis.com/youtube/v3/channels?part=statistics&id=" +
			process.env.YOUTUBE_CHANNEL_ID +
			"&key=" +
			process.env.YOUTUBE_API_KEY
	);
}

async function saveVideosWithDetails(videoDetailsArray) {
	try {
		videoDetailsArray.forEach(async (videoDetails) => {
			await prisma.video.create({
				data: videoDetails,
			});
		});
	} catch (error) {
		console.log(error);
	}
}

function getVideoInfoPerYoutubePage(pageToken = "", allowLoop = true) {
	// If pageToken is provided, use it to get the next page of videos
	// Otherwise, get the first page of videos
	const url = pageToken
		? "https://www.googleapis.com/youtube/v3/search?pageToken=" +
		  pageToken +
		  "&part=snippet&maxResults=50&order=date&q=site%3Ayoutube.com&channelId=" +
		  process.env.YOUTUBE_CHANNEL_ID +
		  "&key=" +
		  process.env.YOUTUBE_API_KEY
		: "https://www.googleapis.com/youtube/v3/search?&part=snippet&maxResults=50&order=date&q=site%3Ayoutube.com&channelId=" +
		  process.env.YOUTUBE_CHANNEL_ID +
		  "&key=" +
		  process.env.YOUTUBE_API_KEY;

	axios
		.get(url)
		.then(async function (response) {
			const nextPageToken = response.data.nextPageToken;
			// const countVideos = response.data.pageInfo.totalResults;

			const videosWithDetails = await Promise.all(
				response.data.items.map(async (video) => {
					// Check if video already exists in database
					const videoExists = !!(await prisma.video.findFirst({
						where: {
							id: video.id.videoId,
						},
					}));

					// If video exists, set allowLoop to false
					// to stop the loop. This indicates that the current page
					// has entirely or partially been saved to the database.
					// if (videoExists) {
					// 	allowLoop = false;
					// 	return;
					// }

					// If video doesn't exist, get video details
					if (!videoExists) {
						return getVideoDetails(video.id.videoId);
					}
				})
			);

			const filteredVideosWithDetails = videosWithDetails.filter(
				(video) => video !== undefined
			);

			if (filteredVideosWithDetails.length > 0) {
				await saveVideosWithDetails(filteredVideosWithDetails);
			}

			console.log(!!nextPageToken, allowLoop);
			if (nextPageToken && allowLoop) {
				console.log("videos in database - ", await prisma.video.count());
				getVideoInfoPerYoutubePage(nextPageToken, allowLoop);
			}
		})
		.catch(function (error) {
			console.log(error);
		});
}

// Start the app
async function startBoilertube() {
	// Get count of Boilerroom Youtube videos from their API
	const countYoutubeVideosResponse = await getCountYoutubeVideos();
	const countYoutubeVideos = Number(
		countYoutubeVideosResponse?.data?.items[0]?.statistics?.videoCount
	);

	// Get count of saved videos in database
	const countSavedVideos = await prisma.video.count();

	// If there are more videos on Youtube than in database, get new videos
	if (countSavedVideos < countYoutubeVideos) {
		getVideoInfoPerYoutubePage();
	}
}

const server = http.createServer(app);
server.listen(port, async () => {
	console.log(`App running on port: ${port}`);
	// console.log(await prisma.video.count());
	// await startBoilertube();
});
