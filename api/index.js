import express from "express";
import http from "http";
import axios from "axios";
import path from "path";
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

app.use(express.json());
app.use(cors());

dotenv.config();

// Endpoints
app.get("/version", (req, res) => {
	res.json({ version: packageJson.version });
});

app.get("/videos", async (req, res) => {
	const { fromdate: fromDate, channel } = req.query;

	if (fromDate) {
		const fromDateVideos = await getAllVideosBetweenDates(channel, fromDate);
		res.json({ channel, fromDateVideos });
	} else {
		res.status(400).json({ error: "fromdate parameter is required" });
	}
});

app.get("/available-channels", async (req, res) => {
	const channels = await prisma.channels.findMany();
	res.json({ channels });
});

app.get("/channels/:subdomain", async (req, res) => {
	const { subdomain } = req.params;
	const channel = await prisma.channels.findUnique({
		where: { subdomain },
	});
	res.json({ channel });
});

app.get("/start-fill-database", async (req, res) => {
	const { channelid: channelId = '' } = req.query;
	if (!channelId) {
		await refreshOldestChannelData();
		console.log(
			"Run refreshOldestChannelData at " + moment().format("YYYY-MM-DD HH:mm:ss")
		);
	}

	console.log("Start filling database");
	await createOrUpdateVideosFromChannel(channelId);
	res.send(`Fill the ${channelId} database to the brim!!`);
});

// Functions
async function getAllVideosBetweenDates(channel = '', fromDate = '') {
	const videos = await prisma.video.findMany({
		where: {
			channel,
			publishedAt: {
				gte: fromDate,
			},
		},
	});

	return videos
		.filter(video => video.viewCount !== 0)
		.sort((a, b) => b.viewCount - a.viewCount);
}

function sanitizeFilename(filename) {
	return filename
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^a-zA-Z0-9]/g, "")
		.replace(/\s+/g, '')
		.toLowerCase();
}

async function getVideoDetails(videoId) {
	try {
		const response = await axios.get(
			`https://www.googleapis.com/youtube/v3/videos`,
			{
				params: {
					part: 'statistics,snippet',
					id: videoId,
					key: process.env.YOUTUBE_API_KEY
				}
			}
		);

		const videoDetails = response.data.items[0];

		return {
			id: videoDetails.id,
			channel: sanitizeFilename(videoDetails.snippet.channelTitle),
			publishedAt: videoDetails.snippet.publishedAt,
			title: videoDetails.snippet.title,
			thumbnails: JSON.stringify(videoDetails.snippet.thumbnails),
			viewCount: Number(videoDetails.statistics.viewCount),
		};
	} catch (error) {
		console.error("Error fetching video details:", error.message);
		return null;
	}
}

async function refreshOldestChannelData() {
	const oldestChannel = await prisma.channels.findFirst({
		orderBy: {
			updatedAt: "asc",
		},
	});

	if (oldestChannel) {
		console.log(`Refreshing ${oldestChannel.channelName} channel data`);
		await createOrUpdateVideosFromChannel(oldestChannel.id);
	}
}

async function upsertVideosWithDetails(video) {
	try {
		await prisma.video.upsert({
			where: { id: video.id },
			update: {
				viewCount: video.viewCount,
				thumbnails: video.thumbnails,
				channel: video.channel,
			},
			create: video,
		});
	} catch (error) {
		console.error("upsertVideosWithDetails failed", video, error);
	}
}

async function getVideoInfoPerYoutubePage(uploadsPlaylistId, pageToken = "", iteration = 0) {
	console.log('getVideoInfoPerYoutubePage');
	try {
		const response = await axios.get(
			"https://www.googleapis.com/youtube/v3/playlistItems",
			{
				params: {
					part: 'snippet',
					maxResults: 50,
					pageToken,
					playlistId: uploadsPlaylistId,
					key: process.env.YOUTUBE_API_KEY
				}
			}
		);

		const { nextPageToken, items } = response.data;

		await Promise.all(
			items.map(async (video) => {
				const videoDetails = await getVideoDetails(video.snippet.resourceId.videoId);
				if (videoDetails && videoDetails.viewCount) {
					await upsertVideosWithDetails(videoDetails);
				}
			})
		);

		if (nextPageToken) {
			console.log("iteration - ", iteration + 1);
			await getVideoInfoPerYoutubePage(uploadsPlaylistId, nextPageToken, iteration + 1);
		}
	} catch (error) {
		console.error("Error fetching video info:", error.message);
	}
}

async function getChannelInfo(channelId) {
	const response = await axios.get(
		"https://www.googleapis.com/youtube/v3/channels",
		{
			params: {
				part: 'snippet,contentDetails,statistics',
				id: channelId,
				key: process.env.YOUTUBE_API_KEY
			}
		}
	);

	return response.data.items[0];
}

async function addChannelToDatabase(channelId) {
	const channelInfo = await getChannelInfo(channelId);
	await prisma.channels.upsert({
		where: { id: channelId },
		update: {
			thumbnails: JSON.stringify(channelInfo.snippet.thumbnails),
			subscriberCount: Number(channelInfo.statistics.subscriberCount),
			viewCount: Number(channelInfo.statistics.viewCount),
		},
		create: {
			id: channelId,
			channelName: channelInfo.snippet.title,
			subdomain: sanitizeFilename(channelInfo.snippet.title),
			updatedAt: new Date().toISOString(),
			thumbnails: JSON.stringify(channelInfo.snippet.thumbnails),
			subscriberCount: Number(channelInfo.statistics.subscriberCount),
			viewCount: Number(channelInfo.statistics.viewCount),
		}
	});

	return channelInfo;
}

async function setChannelUpdatedAt(channelId) {
	await prisma.channels.update({
		where: { id: channelId },
		data: { updatedAt: new Date().toISOString() },
	});
}

async function checkIfVideosAreOutdated(channelInfo) {
	try {
		const countYoutubeVideos = Number(channelInfo.statistics.videoCount);
		const countSavedVideos = await prisma.video.count({
			where: { channel: sanitizeFilename(channelInfo.snippet.title) },
		});

		return countSavedVideos < countYoutubeVideos;
	} catch (error) {
		console.error('Error checking if videos are outdated:', error.message);
		return false;
	}
}

async function createOrUpdateVideosFromChannel(channelId) {
	const channelInfo = await addChannelToDatabase(channelId);
	const areVideosOutdated = await checkIfVideosAreOutdated(channelInfo);
	
	if (areVideosOutdated) {
		await setChannelUpdatedAt(channelId);
		await getVideoInfoPerYoutubePage(channelInfo.contentDetails.relatedPlaylists.uploads);
	} else {
		console.log("No new videos to add to database");
	}
}
