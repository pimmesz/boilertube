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

function sanitizeFilename(filename) {
	return filename
			.normalize("NFD") // Normalize to decomposed form
			.replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks
			.replace(/[^a-zA-Z0-9]/g, ""); // Remove non-alphanumeric characters
}

async function getVideoDetails(videoId) {
	try {
		const response = await axios.get(
			`https://www.googleapis.com/youtube/v3/videos?part=statistics&part=snippet&id=${videoId}&key=${process.env.YOUTUBE_API_KEY}`
		);

		const videoDetails = response.data.items[0];

		return {
			id: videoDetails.id,
			channel: videoDetails.snippet.channelTitle.replaceAll(' ', '').toLocaleLowerCase(),
			publishedAt: videoDetails.snippet.publishedAt,
			title: videoDetails.snippet.title,
			thumbnails: JSON.stringify(videoDetails.snippet.thumbnails),
			viewCount: Number(videoDetails.statistics.viewCount),
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

async function upsertVideosWithDetails(video) {
	try {
		await prisma.video.upsert({
			where: {
				id: video.id,
			},
			update: {
				viewCount: video.viewCount,
				thumbnails: video.thumbnails,
				channel: video.channel,
			},
			create: {
				...video,
			},
		});
	} catch (error) {
		console.log("upsertVideosWithDetails failed", video, error);
	}
}

function getVideoInfoPerYoutubePage(uploadsPlaylistId, pageToken = "", iteration = 0) {
	console.log('getVideoInfoPerYoutubePage')
	// If pageToken is provided, use it to get the next page of videos
	// Otherwise, get the first page of videos

	// Google API usage overview
	// https://console.cloud.google.com/iam-admin/quotas?project=boilerbot-373414
	const url = pageToken
		? "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&pageToken=" +
		  pageToken +
		  "&playlistId=" +
		  uploadsPlaylistId +
		  "&key=" +
		  process.env.YOUTUBE_API_KEY
		: "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=50&playlistId=" +
			uploadsPlaylistId +
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
						await upsertVideosWithDetails(videoDetails);
					}

					return;
				})
			);

			if (nextPageToken) {
				iteration++;
				console.log("iteration - ", iteration);
				getVideoInfoPerYoutubePage(uploadsPlaylistId, nextPageToken, iteration);
			}
		})
		.catch(function (error) {
			console.log(error);
		});
}

async function getChannelInfo(channelId) {
	const channelInfo = await axios.get(
		`https://www.googleapis.com/youtube/v3/channels?part=snippet%2CcontentDetails%2Cstatistics&id=${channelId}&key=${process.env.YOUTUBE_API_KEY}`
	);

	return channelInfo.data.items[0];
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
	await prisma.channels.upsert({
		where: {
			id: channelId,
		},
		update: {
			thumbnails: JSON.stringify(channelInfo.snippet.thumbnails),
			subscriberCount: Number(channelInfo.statistics.subscriberCount),
			viewCount: Number(channelInfo.statistics.viewCount),
		},
		create: {
			id: channelId,
			channelName: channelInfo.snippet.title,
			subdomain: sanitizeFilename(channelInfo.snippet.title.replaceAll(' ', '').toLocaleLowerCase()),
			updatedAt: new Date(Date.now()).toISOString(),
			thumbnails: JSON.stringify(channelInfo.snippet.thumbnails),
			subscriberCount: Number(channelInfo.statistics.subscriberCount),
			viewCount: Number(channelInfo.statistics.viewCount),
		}
	});

	return channelInfo;
}

async function setChannelUpdatedAt(channelId) {
	await prisma.channels.update({
		where: {
			id: channelId,
		},
		data: {
			updatedAt: new Date(Date.now()).toISOString(),
		},
	});
}

async function checkIfVideosAreOutdated(channelInfo) {
	try {
		// Get count of Youtube videos from their API
		const countYoutubeVideos = Number(channelInfo.statistics.videoCount)
	
		// Get count of saved videos in database
		const countSavedVideos = await prisma.video.count({
			where: {
				id: channelInfo.id
			},
		});

		// If there are more videos on Youtube than in database, get new videos
		return countSavedVideos < countYoutubeVideos	
	} catch (error) {
		console.log('Doesnt work', error)
	}
}

async function createOrUpdateVideosFromChannel(channelId) {
	const channelInfo = await addChannelToDatabase(channelId);
	const areVideosOutdated = await checkIfVideosAreOutdated(channelInfo);
	
	// If there are more videos on Youtube than in database, get new videos
	if (areVideosOutdated) {
		setChannelUpdatedAt(channelId);
		getVideoInfoPerYoutubePage(channelInfo.contentDetails.relatedPlaylists.uploads);
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
