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
  scope: 'https://www.googleapis.com/auth/youtube',
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
const getTopVideos = async (channel, timeFrame = 1) => {
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - timeFrame);

  // First, get all videos in the timeframe
  const allVideos = await prisma.video.findMany({
    where: {
      channel: channel.subdomain,
      publishedAt: {
        gte: startDate
      }
    },
    orderBy: { viewCount: 'desc' },
  });

  // Calculate the number of videos to return (25% of total)
  const topCount = Math.ceil(allVideos.length * 0.25);

  // Return the top 25% of videos
  return allVideos.slice(0, topCount);
};

const getPlaylistTitle = (channel, timeFrame) => {
  if (timeFrame === 1) {
    return `Top videos last month - ${channel.channelName}`;
  } else {
    return `Top videos past ${timeFrame} months - ${channel.channelName}`;
  }
};
const createNewPlaylist = async (youtube, playlistTitle, channel) => {
  try {
    // Delete all existing playlists
    const response = await youtube.playlists.list({
      part: 'id',
      channelId: channel.id,
      maxResults: 50
    });

    for (const playlist of response.data.items) {
      await youtube.playlists.delete({
        id: playlist.id
      });
    }

    // Create a new playlist
    const newPlaylist = await youtube.playlists.insert({
      part: 'snippet,status',
      requestBody: {
        snippet: {
          title: playlistTitle,
          description: `${playlistTitle} - created ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`
        },
        status: {
          privacyStatus: 'public'
        }
      }
    });

    return newPlaylist.data.id;
  } catch (error) {
    console.error('Error in createNewPlaylist:', error);
    throw error;
  }
};

const insertVideosInPlaylist = async (youtube, playlistId, topVideos) => {
  try {
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
    console.error('Error in insertVideosInPlaylist:', error);
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

    const videoIds = response.data.items.map(item => item.id.videoId);
    const videoDetails = await youtube.videos.list({
      part: 'statistics,contentDetails',
      id: videoIds.join(',')
    });

    const upsertPromises = response.data.items.map((item, index) => {
      const details = videoDetails.data.items[index];
      return prisma.video.upsert({
        where: { id: item.id.videoId },
        update: {
          title: item.snippet.title,
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          publishedAt: new Date(item.snippet.publishedAt),
          viewCount: BigInt(details.statistics.viewCount || 0)
        },
        create: {
          id: item.id.videoId,
          channelName: item.snippet.channelTitle,
          subdomain: sanitizeFilename(item.snippet.channelTitle),
          channelId: channelId,
          title: item.snippet.title,
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          publishedAt: new Date(item.snippet.publishedAt),
          viewCount: BigInt(details.statistics.viewCount || 0)
        }
      });
    });

    await Promise.all(upsertPromises);

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
  const updatedChannels = [];
  try {
    const youtube = await getYoutubeClient();
    const channels = await prisma.channels.findMany();

    // Randomize the order of channels
    const shuffledChannels = channels.sort(() => Math.random() - 0.5);

    // Delete all existing playlists
    await deleteAllExistingPlaylists(youtube);

    for (const channel of shuffledChannels) {
      let topVideos = await getTopVideos(channel, 1);
      let timeFrame = 1;
      if (topVideos.length < 10) {
        topVideos = await getTopVideos(channel, 3);
        timeFrame = 3;
      }
      const playlistTitle = getPlaylistTitle(channel, timeFrame);      
      const playlistId = await createNewPlaylist(youtube, playlistTitle, channel);
      await insertVideosInPlaylist(youtube, playlistId, topVideos);
      updatedChannels.push(channel.channelName);
    }

    res.status(200).json({ 
      message: "Playlists created and videos added successfully",
      updatedChannels: updatedChannels
    });
  } catch (error) {
    res.status(500).json({ 
      error: error.response?.data || error.message,
      updatedChannels: updatedChannels
    });
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
