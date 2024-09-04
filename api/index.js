// Check number of current Youtube API requests
// https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas?project=boilerbot-373414

// Import necessary modules
import express from "express";
import http from "http";
import cors from "cors";
import * as dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import packageJson from '../package.json' assert { type: 'json' };
import { google } from 'googleapis';
import axios from 'axios';

// Load environment variables
dotenv.config();

// Initialize Prisma client
const prisma = new PrismaClient();

// Set up Express app
const app = express();
const port = process.env.PORT || 3003;

// Middleware
app.use(express.json());
app.use(cors());

// Environment variables
const {
  CLIENT_EXPIRATION_DATE,
  CLIENT_REFRESH_TOKEN,
  CLIENT_TOKEN,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  TELEGRAM_API_KEY,
  TELEGRAM_CHAT_ID
} = process.env;

// Constants
const SCOPE = 'https://www.googleapis.com/auth/youtube';

// Set up OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

if (!CLIENT_EXPIRATION_DATE) {
  throw new Error('The token expiration date is required');
}

const credentials = {
  access_token: CLIENT_TOKEN,
  expiry_date: +CLIENT_EXPIRATION_DATE,
  refresh_token: CLIENT_REFRESH_TOKEN,
  scope: SCOPE,
  token_type: 'Bearer',
};

oauth2Client.setCredentials(credentials);

oauth2Client.on('tokens', (tokens) => {
  if (tokens.refresh_token) {
    process.env.CLIENT_REFRESH_TOKEN = tokens.refresh_token;
  }
  process.env.CLIENT_TOKEN = tokens.access_token;
  process.env.CLIENT_EXPIRATION_DATE = tokens.expiry_date;

  oauth2Client.setCredentials(tokens);
});

// Utility functions
BigInt.prototype.toJSON = function() { return this.toString() };

const getYoutubeClient = async () => {
  const freshCredentials = await oauth2Client.getAccessToken();
  if (!freshCredentials || !freshCredentials.token) {
    throw new Error('Failed to obtain fresh access token');
  }
  oauth2Client.setCredentials({ access_token: freshCredentials.token });
  return google.youtube({ version: 'v3', auth: oauth2Client });
};

const sanitizeFilename = (filename) => {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
};

const getTopVideos = async (channel) => {
  const videos = await prisma.video.findMany({
    where: { channelId: channel.id },
    orderBy: { viewCount: 'desc' },
    take: 10
  });
  return videos;
};

const getPlaylistTitle = (topVideos, channel) => {
  return `Top 10 Videos - ${channel.title}`;
};

const getOrCreatePlaylist = async (youtube, playlistTitle, channel) => {
  try {
    const response = await youtube.playlists.list({
      part: 'snippet',
      channelId: channel.id,
      maxResults: 50
    });

    const existingPlaylist = response.data.items.find(playlist => playlist.snippet.title === playlistTitle);

    if (existingPlaylist) {
      return existingPlaylist.id;
    } else {
      const newPlaylist = await youtube.playlists.insert({
        part: 'snippet',
        requestBody: {
          snippet: {
            title: playlistTitle,
            description: `Top 10 videos from ${channel.title}`
          }
        }
      });
      return newPlaylist.data.id;
    }
  } catch (error) {
    console.error('Error in getOrCreatePlaylist:', error);
    throw error;
  }
};

const updatePlaylistVideos = async (youtube, playlistId, topVideos) => {
  try {
    // Clear existing items in the playlist
    const existingItems = await youtube.playlistItems.list({
      part: 'id',
      playlistId: playlistId,
      maxResults: 50
    });

    for (const item of existingItems.data.items) {
      await youtube.playlistItems.delete({
        id: item.id
      });
    }

    // Add new items to the playlist
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
  } catch (error) {
    console.error('Error in updatePlaylistVideos:', error);
    throw error;
  }
};

const getAllVideosBetweenDates = async (channel, fromDate) => {
  const videos = await prisma.video.findMany({
    where: {
      channel: channel,
      publishedAt: {
        gte: new Date(fromDate)
      }
    },
    orderBy: {
      viewCount: 'desc'
    }
  });
  return videos;
};

const refreshOldestChannelData = async () => {
  const oldestChannel = await prisma.channels.findFirst({
    orderBy: {
      updatedAt: 'asc'
    }
  });

  if (oldestChannel) {
    await upsertVideosFromChannel(oldestChannel.id);
  }
};

const upsertVideosFromChannel = async (channelId) => {
  const youtube = await getYoutubeClient();
  let nextPageToken = '';

  do {
    const response = await youtube.search.list({
      part: 'snippet',
      channelId: channelId,
      maxResults: 50,
      order: 'date',
      type: 'video',
      pageToken: nextPageToken
    });

    for (const item of response.data.items) {
      const videoDetails = await youtube.videos.list({
        part: 'statistics,contentDetails',
        id: item.id.videoId
      });

      await prisma.video.upsert({
        where: { id: item.id.videoId },
        update: {
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          publishedAt: new Date(item.snippet.publishedAt),
          viewCount: BigInt(videoDetails.data.items[0].statistics.viewCount || 0),
          likeCount: BigInt(videoDetails.data.items[0].statistics.likeCount || 0),
          duration: videoDetails.data.items[0].contentDetails.duration
        },
        create: {
          id: item.id.videoId,
          channelName: item.snippet.channelTitle,
          subdomain: sanitizeFilename(item.snippet.channelTitle),
          channelId: channelId,
          title: item.snippet.title,
          description: item.snippet.description,
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          publishedAt: new Date(item.snippet.publishedAt),
          viewCount: BigInt(videoDetails.data.items[0].statistics.viewCount || 0),
          likeCount: BigInt(videoDetails.data.items[0].statistics.likeCount || 0),
          duration: videoDetails.data.items[0].contentDetails.duration
        }
      });
    }

    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  await prisma.channels.update({
    where: { id: channelId },
    data: { updatedAt: new Date() }
  });
};

// API Routes
app.get("/version", (req, res) => {
  res.json({ version: packageJson.version });
});

app.get("/upsert-playlists", async (req, res) => {
  try {
    const youtube = await getYoutubeClient();
    const channels = await prisma.channels.findMany();

    for (const channel of channels) {
      const topVideos = await getTopVideos(channel);
      const playlistTitle = getPlaylistTitle(topVideos, channel);
      
      const playlistId = await getOrCreatePlaylist(youtube, playlistTitle, channel);
      await updatePlaylistVideos(youtube, playlistId, topVideos);
    }

    res.status(200).json({ message: "Playlists created and videos added successfully" });
  } catch (error) {
    res.status(500).json({ error: error.response?.data || error.message });
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

app.post("/send-telegram-message", async (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const telegramApiUrl = `https://api.telegram.org/bot${TELEGRAM_API_KEY}/sendMessage`;
    await axios.post(telegramApiUrl, {
      chat_id: TELEGRAM_CHAT_ID,
      text: message
    });
    res.status(200).json({ message: "Telegram message sent successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to send Telegram message" });
  }
});

app.get("/channels/:subdomain", async (req, res) => {
  const { subdomain } = req.params;
  const sanitizedSubdomain = sanitizeFilename(subdomain);
  const channel = await prisma.channels.findUnique({
    where: { subdomain: sanitizedSubdomain },
  });
  res.json({ channel });
});

app.get("/search-channels/:channelName", async (req, res) => {
  const { channelName } = req.params;
  try {
    const youtube = await getYoutubeClient();
    const response = await youtube.search.list({
      part: 'snippet',
      q: channelName,
      type: 'channel',
      maxResults: 5
    });

    const channels = response.data.items.map(item => ({
      id: item.id.channelId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnails: item.snippet.thumbnails
    }));

    res.json({ channels });
  } catch (error) {
    console.error('Error searching for channels:', error);
    res.status(500).json({ error: `An error occurred while searching for channels: ${error.errors[0].reason}` });
  }
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
    console.error(error);
    res.status(429).json({ error: "Exceeded Youtube API quota" });
  }
});

// Start the app
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`App running on port: ${port}`);
});
