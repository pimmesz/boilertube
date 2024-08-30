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
	const subdomain = getSubdomain(req.host);
	req.subdomain = subdomain;
	next();
});

dotenv.config();

// Endpoints
app.get("/version", (req, res, next) => {
	res.send(`Version: ${packageJson.version}`);
});

app.get("/videos", async (req, res, next) => {
	const fromDate = req.query.fromdate;
	const channel = req.query.channel;

	if (fromDate) {
		const fromDateVideos = await getAllVideosBetweenDates(channel, fromDate);

		res.send(
			JSON.stringify({
				channel,
				fromDateVideos,
			})
		);
		return;
	}
});

app.get("/available-channels", async (req, res, next) => {
	const channels = await prisma.channels.findMany();
	return res.send(
		JSON.stringify({
			channels,
		})
	);
});

app.get("/start-fill-database", async (req, res, next) => {
	console.log("Start filling database");
	const channelId = req.query.channelid ?? '';
	if (!channelId) {
		res.send("<h1>Please provide a channelId</h1>");
		return;
	}

	await createOrUpdateVideosFromChannel(channelId);
	res.send(`Fill the ${channelId} database to the brim!!`);
});

// Functions
async function getAllVideosBetweenDates(
	channel = '',
	fromDate = '',
) {
	const videos = await prisma.video.findMany({
		where: {
			channel,
			publishedAt: {
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
	// Define the regex pattern
	const pattern = /(?:https:\/\/)?([^.]+)/;
	
	// Apply the regex pattern to the input URL or string
	const match = url.match(pattern);
	
	// If a match is found, return the captured group, else return null
	return match ? match[1] : null;
}

async function getVideoDetails(videoId) {
	try {
		const response = await axios.get(
			`https://youtube.googleapis.com/youtube/v3/videos?part=statistics&part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
		);

		const videoDetails = response.data.items[0];

		return {
			id: videoDetails.id,
			channel: videoDetails.snippet.channelTitle.replaceAll(' ', '').toLocaleLowerCase(),
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

async function refreshOldestChannelData() {
	const oldestChannel = await prisma.channels.findFirst({
		orderBy: {
			updatedAt: "asc",
		},
	});

	if (oldestChannel) {
		console.log(`Refresh ${oldestChannel.channelName} channel data`)
		await createOrUpdateVideosFromChannel(oldestChannel.id);
	}
}

function getCountYoutubeVideos(channelId) {
	return axios.get(
		"https://www.googleapis.com/youtube/v3/playlistItems?playlistId=" +
			channelId +
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
		  channelId +
		  "&key=" +
		  process.env.YOUTUBE_API_KEY
		: "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=" +
		  channelId +
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

async function getChannelInfo(channelId) {
	const channelInfo = await axios.get(
		`https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails,statistics&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`
	);

	return channelInfo.data.items[0].snippet;
}

async function addChannelToDatabase(channelId) {
	// Check if channel exists in database
	const channel = await prisma.channels.findFirst({
		where: {
			id: channelId,
		},
	});

	// If channel does not exist, get channel info from Youtube API
	const channelInfo = await getChannelInfo(channelId);
	if (!channel) {
		await prisma.channels.create({
			data: {
				id: channelId,
				channelName: channelInfo.title,
				subdomain: channelInfo.title.replaceAll(' ', '').toLocaleLowerCase(),
				updatedAt: new Date(Date.now()).toISOString(),
			},
		});
	}
}

async function resetChannelUpdatedAt(channelId) {
	await prisma.channels.update({
		where: {
			id: channelId,
		},
		data: {
			updatedAt: new Date(Date.now()).toISOString(),
		},
	});
}

async function checkIfVideosAreOutdated(channelId) {
		// Get count of Youtube videos from their API
		const countYoutubeVideosResponse = await getCountYoutubeVideos(channelId);
		const countYoutubeVideos = Number(
			countYoutubeVideosResponse?.data?.pageInfo?.totalResults
		);
	
		// Get count of saved videos in database
		const countSavedVideos = await prisma.video.count();
		return countSavedVideos < countYoutubeVideos
}

async function createOrUpdateVideosFromChannel(channelId) {
	await addChannelToDatabase(channelId);

	const areVideosOutdated = await checkIfVideosAreOutdated(channelId);

	// If there are more videos on Youtube than in database, get new videos
	if (areVideosOutdated) {
		getVideoInfoPerYoutubePage(channelId);
		resetChannelUpdatedAt(channelId);
	} else {
		console.log("No new videos to add to database");
	}
}

// Start the app
const server = http.createServer(app);
server.listen(port, async () => {
	console.log(`App running on port: ${port}`);
	cron.schedule("0 0 0 * * *", async () => {
		await refreshOldestChannelData();
		console.log(
			"Run refreshOldestChannelData at " + moment().format("MMMM Do YYYY, h:mm:ss a")
		);
	});
});
