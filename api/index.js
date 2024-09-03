import express from "express";
import http from "http";
import axios from "axios";
import cors from "cors";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import packageJson from '../package.json' assert { type: 'json' };
import { google } from 'googleapis';

// Check number of current Youtube api requests
// https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas?project=boilerbot-373414

const prisma = new PrismaClient();
const app = express();
const port = process.env.PORT || 3003;

const { CLIENT_EXPIRATION_DATE, CLIENT_REFRESH_TOKEN, CLIENT_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

const { OAuth2 } = google.auth;
const SCOPE = 'https://www.googleapis.com/auth/youtube';

const oauth2Client = new OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);

if (!CLIENT_EXPIRATION_DATE) {
  throw new Error('The token expiration date is required');
}

const credentials = {
  access_token: CLIENT_TOKEN,
  expiry_date: +CLIENT_EXPIRATION_DATE, // The plus sign in front cast the string type to a number
  refresh_token: CLIENT_REFRESH_TOKEN,
  scope: SCOPE,
  token_type: 'Bearer',
};

oauth2Client.setCredentials(credentials);

// Set up token refresh mechanism
oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    // Store the new refresh token
    process.env.CLIENT_REFRESH_TOKEN = tokens.refresh_token;
  }
  // Always store the new access token
  process.env.CLIENT_TOKEN = tokens.access_token;
  process.env.CLIENT_EXPIRATION_DATE = tokens.expiry_date;

  // Update the client's credentials
  oauth2Client.setCredentials(tokens);
});

app.use(express.json());
app.use(cors());
dotenv.config();

// Serialize BigInt to String
BigInt.prototype.toJSON = function() { return this.toString() };

// Endpoints
app.get("/version", (req, res) => {
	res.json({ version: packageJson.version });
});


app.get("/upsert-playlists", async (req, res) => {
	try {
		// Ensure the token is fresh before making the request
		const freshCredentials = await oauth2Client.getAccessToken();
		if (!freshCredentials || !freshCredentials.token) {
			throw new Error('Failed to obtain fresh access token');
		}
		oauth2Client.setCredentials({ access_token: freshCredentials.token });

		const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

		// Get all channels
		const channels = await prisma.channels.findMany();
		for (const channel of channels) {
			// Specify the playlist title
			const playlistTitle = `Top 30 Videos - ${channel.channelName}`;
			const existingPlaylists = await youtube.playlists.list({
				part: 'snippet',
				mine: true
			});

			let playlistId = existingPlaylists.data.items.find(playlist => playlist.snippet.title === playlistTitle)?.id;

			// Parse the channel thumbnails
			const channelThumbnails = JSON.parse(channel.thumbnails);

			if (!playlistId) {
				console.log('Creating playlist', playlistTitle);
				// Create a new playlist if it doesn't exist
				const response = await youtube.playlists.insert({
					part: 'snippet,status',
					requestBody: {
						snippet: {
							title: playlistTitle,
							description: `Top 30 videos from ${playlistTitle}`,
							thumbnails: {
								medium: channelThumbnails.medium
							}
						},
						status: {
							privacyStatus: 'public'
						}
					}
				});
				playlistId = response.data.id;
			} else {
				// Update existing playlist thumbnail
				await youtube.playlists.update({
					part: 'snippet',
					requestBody: {
						id: playlistId,
						snippet: {
							title: playlistTitle,
							description: `Top 30 videos from ${playlistTitle}`,
							thumbnails: {
								medium: channelThumbnails.medium
							}
						}
					}
				});
			}

			// Get top 30 videos for the channel
			const topVideos = await prisma.video.findMany({
				where: { channel: channel.id },
				orderBy: { viewCount: 'desc' },
				take: 30
			});

			// Add videos to the playlist
			for (const video of topVideos) {
				await youtube.playlistItems.insert({
					part: 'snippet',
					requestBody: {
						snippet: {
							playlistId: playlistId,
							resourceId: {
								kind: 'youtube#video',
								videoId: video.id
							}
						}
					}
				});
			}
		}

		res.status(200).json({ message: "Playlists created and videos added successfully" });
	} catch (error) {
		console.error("Error creating playlists or adding videos:", error);
		res.status(500).json( error.response.data );
	}
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
	try {
		if (!channelId) {
			await refreshOldestChannelData();
			res.status(200).json({ message: "Refreshed oldest channel data successfully" });
		} else {
			await upsertVideosFromChannel(channelId);
			res.status(200).json({ message: `Updated database for channel ${channelId} successfully` });
		}
	} catch (error) {
		console.log(error)
		res.status(429).json({ error: "Exceeded Youtube API quota" });
	}
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
		.sort((a, b) => Number(b.viewCount) - Number(a.viewCount));
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
		// Ensure the token is fresh before making the request
		const freshCredentials = await oauth2Client.getAccessToken();
		if (!freshCredentials || !freshCredentials.token) {
			throw new Error('Failed to obtain fresh access token');
		}
		oauth2Client.setCredentials({ access_token: freshCredentials.token });

		const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
		const response = await youtube.videos.list({
			part: 'statistics,snippet',
			id: videoId
		});

		const videoDetails = response.data.items[0];

		return {
			id: videoDetails.id,
			channel: sanitizeFilename(videoDetails.snippet.channelTitle),
			publishedAt: videoDetails.snippet.publishedAt,
			title: videoDetails.snippet.title,
			thumbnails: JSON.stringify(videoDetails.snippet.thumbnails),
			viewCount: BigInt(videoDetails.statistics.viewCount),
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
		console.log(`Refreshing ${oldestChannel.channelName} last updated on ${oldestChannel.updatedAt}`);
		await upsertVideosFromChannel(oldestChannel.id);
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
	console.log('Fetching video info for playlist:', uploadsPlaylistId, 'Page token:', pageToken);
	try {
		// Ensure the token is fresh before making the request
		const freshCredentials = await oauth2Client.getAccessToken();
		if (!freshCredentials || !freshCredentials.token) {
			throw new Error('Failed to obtain fresh access token');
		}
		oauth2Client.setCredentials({ access_token: freshCredentials.token });

		const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
		const response = await youtube.playlistItems.list({
			part: 'snippet',
			maxResults: 50,
			pageToken,
			playlistId: uploadsPlaylistId
		});

		const { nextPageToken, items } = response.data;

		for (const video of items) {
			const videoDetails = await getVideoDetails(video.snippet.resourceId.videoId);
			if (videoDetails && videoDetails.viewCount) {
				await upsertVideosWithDetails(videoDetails);
			}
		}

		if (nextPageToken) {
			console.log("Fetching next page, iteration:", iteration + 1);
			await getVideoInfoPerYoutubePage(uploadsPlaylistId, nextPageToken, iteration + 1);
		}
	} catch (error) {
		console.error("Error fetching video info:", error.message);
	}
}

async function getChannelInfo(channelId) {
	// Ensure the token is fresh before making the request
	const freshCredentials = await oauth2Client.getAccessToken();
	if (!freshCredentials || !freshCredentials.token) {
		throw new Error('Failed to obtain fresh access token');
	}
	oauth2Client.setCredentials({ access_token: freshCredentials.token });

	const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
	const response = await youtube.channels.list({
		part: 'snippet,contentDetails,statistics',
		id: channelId
	});

	return response.data.items[0];
}

async function upsertChannelInfo(channelId) {
	const channelInfo = await getChannelInfo(channelId);
	await prisma.channels.upsert({
		where: { id: channelId },
		update: {
			thumbnails: JSON.stringify(channelInfo.snippet.thumbnails),
			subscriberCount: BigInt(channelInfo.statistics.subscriberCount),
			viewCount: BigInt(channelInfo.statistics.viewCount),
		},
		create: {
			id: channelId,
			channelName: channelInfo.snippet.title,
			subdomain: sanitizeFilename(channelInfo.snippet.title),
			updatedAt: new Date().toISOString(),
			thumbnails: JSON.stringify(channelInfo.snippet.thumbnails),
			subscriberCount: BigInt(channelInfo.statistics.subscriberCount),
			viewCount: BigInt(channelInfo.statistics.viewCount),
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
		const countYoutubeVideos = BigInt(channelInfo.statistics.videoCount);
		const countSavedVideos = await prisma.video.count({
			where: { channel: sanitizeFilename(channelInfo.snippet.title) },
		});

		return countSavedVideos < countYoutubeVideos;
	} catch (error) {
		console.error('Error checking if videos are outdated:', error.message);
		return false;
	}
}

async function upsertVideosFromChannel(channelId) {
	const channelInfo = await upsertChannelInfo(channelId);
	const areVideosOutdated = await checkIfVideosAreOutdated(channelInfo);
	
	if (areVideosOutdated) {
		await setChannelUpdatedAt(channelId);
		await getVideoInfoPerYoutubePage(channelInfo.contentDetails.relatedPlaylists.uploads);
	} else {
		console.log("No new videos to add to database");
	}
}

// Start the app
const server = http.createServer(app);
server.listen(port, () => {
	console.log(`App running on port: ${port}`);
});
