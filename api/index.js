import express from "express";
import http from "http";
import axios from "axios";
import path from "path";
import bodyParser from "body-parser";
import cors from "cors";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import * as cron from "node-cron";
import moment from "moment";
import packageJson from '../package.json' assert { type: 'json' };

const prisma = new PrismaClient();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3003;

app.use(express.static(__dirname + "./../dist"));
app.use(bodyParser.json());
app.use(cors());
app.use((req, res, next) => {
	const subdomain = getSubdomain(req.headers.origin);
	req.subdomain = subdomain;
	next();
});

dotenv.config();

// Endpoints
app.get("/version", (req, res, next) => {
	res.send(`Version: ${packageJson.version}`);
});

app.get("/boilerroom-videos", async (req, res, next) => {
	const fromDate = req.query.fromdate;
	const toDate = req.query.todate;

	if (fromDate && toDate) {
		const betweenDateVideos = await getAllVideosBetweenDates(fromDate, toDate);

		res.send(
			JSON.stringify({
				betweenDateVideos: betweenDateVideos,
			})
		);
		return;
	}

	if (fromDate) {
		const fromDateVideos = await getAllVideosBetweenDates(fromDate);

		res.send(
			JSON.stringify({
				fromDateVideos: fromDateVideos,
			})
		);
		return;
	}
});

app.get("/start-fill-database", async (req, res, next) => {
	console.log("Start filling database");
	await startBoilertube();

	res.send("Fill this database to the brim!!");
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

function getSubdomain(url) {
	let urlObj = new URL(url);
	let hostname = urlObj.hostname;
	
	let hostnameParts = hostname.split('.');
	if (hostnameParts.length > 2) {
			return hostnameParts[0]; // Return the first part, which is the subdomain
	} else {
			return null; // No subdomain present
	}
}

async function getVideoDetails(videoId) {
	try {
		const response = await axios.get(
			`https://youtube.googleapis.com/youtube/v3/videos?part=statistics&part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
		);

		const videoDetails = response.data.items[0];

		return {
			id: videoDetails.id,
			channel: videoDetails.snippet.channelTitle,
			updatedAt: new Date(Date.now()).toISOString(),
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
		"https://www.googleapis.com/youtube/v3/playlistItems?playlistId=" +
			process.env.YOUTUBE_CHANNEL_ID +
			"&key=" +
			process.env.YOUTUBE_API_KEY
	);
}

async function saveOrUpdateVideosWithDetails(video) {
	try {
		await prisma.video.upsert({
			where: {
				id: video.id,
			},
			update: {
				viewCount: video.viewCount,
				updatedAt: video.updatedAt,
				channel: video.channel,
			},
			create: {
				...video,
			},
		});
	} catch (error) {
		console.log("saveOrUpdateVideosWithDetails failed", video, error);
	}
}

function getVideoInfoPerYoutubePage(pageToken = "", iteration = 0) {
	console.log('getVideoInfoPerYoutubePage')
	// If pageToken is provided, use it to get the next page of videos
	// Otherwise, get the first page of videos

	// Google API usage overview
	// https://console.cloud.google.com/iam-admin/quotas?project=boilerbot-373414
	const url = pageToken
		? "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&pageToken=" +
		  pageToken +
		  "&playlistId=" +
		  process.env.YOUTUBE_CHANNEL_ID +
		  "&key=" +
		  process.env.YOUTUBE_API_KEY
		: "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=" +
		  process.env.YOUTUBE_CHANNEL_ID +
		  "&key=" +
		  process.env.YOUTUBE_API_KEY;

	axios
		.get(url)
		.then(async function (response) {
			const { nextPageToken, items } = response.data;

			await Promise.all(
				items.map(async (video) => {
					const videoDetails = await getVideoDetails(
						video.snippet.resourceId.videoId
					);

					if (videoDetails && videoDetails.viewCount) {
						await saveOrUpdateVideosWithDetails(videoDetails);
					}

					return;
				})
			);

			if (nextPageToken) {
				iteration++;
				console.log("iteration - ", iteration);
				console.log("videos in database - ", await prisma.video.count());
				getVideoInfoPerYoutubePage(nextPageToken, iteration);
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
		countYoutubeVideosResponse?.data?.pageInfo?.totalResults
	);

	// Get count of saved videos in database
	const countSavedVideos = await prisma.video.count();

	// If there are more videos on Youtube than in database, get new videos
	if (countSavedVideos < countYoutubeVideos) {
		getVideoInfoPerYoutubePage();
	} else {
		console.log("No new videos to add to database");
	}
}

// Start the app
const server = http.createServer(app);
server.listen(port, async () => {
	console.log(`App running on port: ${port}`);
	cron.schedule("0 0 0 * * *", async () => {
		console.log(
			"Run startBoilertube at " + moment().format("MMMM Do YYYY, h:mm:ss a")
		);
		await startBoilertube();
	});
});
