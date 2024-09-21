// Check number of current Youtube API requests
// https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas?project=boilerbot-373414

// Info about Youtube API oauth2
// https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps#node.js
// https://blog.tericcabrel.com/youtube-data-api-v3-key-nodejs/
// https://github.com/googleapis/google-api-nodejs-client

// Permission overview
// https://myaccount.google.com/connections?continue=https%3A%2F%2Fmyaccount.google.com%2Fsecurity

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
  TELEGRAM_API_KEY,
  TELEGRAM_CHAT_ID
} = process.env;

// Set up OAuth2 client
const GOOGLE_REDIRECT_URI = 'https://tube.yt/oauth2callback';

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
  access_type: 'offline'
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
  try {
    // Refresh the access token
    oauth2Client.refreshAccessToken((err, tokens) => {
      if (err) {
        console.error('Error refreshing access token:', err);
        return;
      }
      
      // Save the new access token
      oauth2Client.setCredentials(tokens);

      // Update environment variables with fresh credentials
      process.env.CLIENT_TOKEN = tokens.access_token;
      process.env.CLIENT_EXPIRATION_DATE = tokens.expiry_date;
      if (tokens.refresh_token) {
        process.env.CLIENT_REFRESH_TOKEN = tokens.refresh_token;
      }
    });

    return google.youtube({ version: 'v3', auth: oauth2Client });
  } catch (error) {
    console.error('Error refreshing OAuth token:', error);
    if (error.response && error.response.data && error.response.data.error === 'invalid_grant') {
      throw new Error('Authentication failed. The refresh token is invalid or has been revoked. Please re-authenticate.');
    }
    throw new Error(`Authentication failed. ${error.message}`);
  }
};

const sanitizeName = (filename) => {
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

  // Calculate the number of videos to return (20% of total)
  const topCount = Math.ceil(allVideos.length * 0.2);

  // Return the top 20% of videos, but no more than 20
  return allVideos.slice(0, Math.min(topCount, 20));
};

const getPlaylistTitle = (channel, timeFrame) => {
  if (timeFrame === 3) {
    return `Top videos ${timeFrame} months - ${channel.channelName}`;
  } else {
    return `Top videos past year - ${channel.channelName}`;
  }
};

const createNewPlaylist = async (youtube, playlistTitle, channelId) => {
  try {
    // Create a new playlist
    const newPlaylist = await youtube.playlists.insert({
      part: 'snippet,status',
      onBehalfOfContentOwner: TUBE_YT_CHANNEL_ID,
      requestBody: {
        snippet: {
          title: playlistTitle,
          description: `${playlistTitle} - created ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
          channelId: channelId
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

  return oldestChannel;
};

const upsertVideosFromChannel = async (channelId) => {
  const youtube = await getYoutubeClient();
  let nextPageToken = '';
  let allUpsertedVideos = [];

  await prisma.channels.update({
    where: { id: channelId },
    data: { 
      updatedAt: new Date().toISOString(),
    }
  });

  do {
    const response = await youtube.playlistItems.list({
      part: 'snippet',
      playlistId: `UU${channelId.substring(2)}`,
      maxResults: 50,
      pageToken: nextPageToken
    });

    const videoIds = response.data.items.map(item => item.snippet.resourceId.videoId);
    const videoDetails = await youtube.videos.list({
      part: 'statistics,contentDetails',
      id: videoIds.join(',')
    });

    const upsertPromises = response.data.items.map((item, index) => {
      const details = videoDetails.data.items[index];
      return prisma.video.upsert({
        where: { id: item.snippet.resourceId.videoId },
        update: {
          channel: sanitizeName(item.snippet.videoOwnerChannelTitle),
          channelId: item.snippet.videoOwnerChannelId,
          publishedAt: new Date(item.snippet.publishedAt),
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          title: item.snippet.title,
          viewCount: BigInt(details.statistics.viewCount || 0)
        },
        create: {
          channel: sanitizeName(item.snippet.channelTitle),
          channelId: item.snippet.videoOwnerChannelId,
          id: item.snippet.resourceId.videoId,
          publishedAt: new Date(item.snippet.publishedAt),
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          title: item.snippet.title,
          viewCount: BigInt(details.statistics.viewCount || 0)
        }
      });
    });

    const upsertedVideos = await Promise.all(upsertPromises);
    allUpsertedVideos = allUpsertedVideos.concat(upsertedVideos);
    console.log('Upserted videos progress: ', allUpsertedVideos.length, ' for channel: ', channelId);

    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  return allUpsertedVideos;
};

// API Routes
app.get("/version", (req, res) => {
  res.json({ version: packageJson.version });
});

app.get("/upsert-playlists", async (req, res) => {
  try {
    const youtube = await getYoutubeClient();

    const oldestChannel = await prisma.channels.findFirst({
      orderBy: { updatedAt: 'asc' }
    });

    if (!oldestChannel) {
      return res.status(404).json({ message: "No channels found" });
    }

    for (const timeFrame of [3, 12]) {
      const topVideos = await getTopVideos(oldestChannel, timeFrame);
      const playlistTitle = getPlaylistTitle(oldestChannel, timeFrame);
      
      const existingPlaylist = await youtube.playlists.list({
        part: 'snippet',
        channelId: TUBE_YT_CHANNEL_ID,
        maxResults: 50
      });
      
      const playlist = existingPlaylist.data.items.find(item => item.snippet.title === playlistTitle);
      
      let playlistId;
      if (playlist) {
        playlistId = playlist.id;
        await clearPlaylist(youtube, playlistId);
      } else {
        playlistId = await createNewPlaylist(youtube, playlistTitle, oldestChannel.channelId);
      }

      console.log(`Inserting ${topVideos.length} videos in playlist ${playlistTitle}`);
      await insertVideosInPlaylist(youtube, playlistId, topVideos);
    }

    await prisma.channels.update({
      where: { id: oldestChannel.id },
      data: { updatedAt: new Date() }
    });

    res.status(200).json({ 
      message: `Playlists updated for ${oldestChannel.channelName} and videos added.`
    });
  } catch (error) {
    console.error('Error in upsert-playlists:', error);
    res.status(500).json({ 
      error: {
        code: error.code || 500,
        message: error.message || "An unexpected error occurred",
        errors: [
          {
            domain: "youtube.CoreErrorDomain",
            reason: error.reason || "UNKNOWN_ERROR"
          }
        ],
        status: error.status || "INTERNAL_SERVER_ERROR"
      }
    });
  }
});

async function clearPlaylist(youtube, playlistId) {
  const playlistItems = await youtube.playlistItems.list({
    part: 'id',
    playlistId: playlistId,
    maxResults: 50
  });
  
  for (const item of playlistItems.data.items) {
    await youtube.playlistItems.delete({ id: item.id });
  }
}

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
  const sanitizedSubdomain = sanitizeName(subdomain);
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
      const oldestChannel = await refreshOldestChannelData();
      res.status(200).json({ message: "Refreshed oldest channel data successfully", oldestChannel });
    } else {
      const allUpsertedVideos = await upsertVideosFromChannel(channelId);
      res.status(200).json({ message: `Updated database for channel ${channelId} successfully with ${allUpsertedVideos.length} videos` });
    }
  } catch (error) {
    console.error(error);
    if (error.message.includes('The refresh token is invalid or has been revoked')) {
      res.status(401).json({ error: "Authentication failed. Please re-authenticate." });
    } else {
      res.status(429).json({ error: "Exceeded Youtube API quota" });
    }
  }
});

// OAuth2 callback endpoint
app.get('/generate-token', async (req, res) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: credentials.access_type,
      scope: credentials.scope,
      prompt: 'consent'
    });

    res.redirect(authUrl);
  } catch (error) {
    console.error('Error generating OAuth URL:', error);
    res.status(500).send('Failed to generate authentication URL: ' + error.message);
  }
});

// OAuth2 callback endpoint
app.get('/oauth2callback', async (req, res) => {
  const { code, error } = req.query;
  
  if (error) {
    console.error('OAuth error:', error);
    return res.status(400).send(`OAuth error: ${error}`);
  }
  
  if (!code) {
    console.error('No authorization code provided in query parameters');
    return res.status(400).send('No authorization code provided. Please try the authentication process again.');
  }
  
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    console.log('Set tokens in environment variables', tokens);
    process.env.CLIENT_TOKEN = tokens.access_token;
    process.env.CLIENT_REFRESH_TOKEN = tokens.refresh_token;
    process.env.CLIENT_EXPIRATION_DATE = tokens.expiry_date;

    // Send a success response without including the tokens in the response
    res.status(200).send('Authentication successful! You can close this window. Tokens: ' + JSON.stringify(tokens));
  } catch (error) {
    console.error('Error exchanging code for tokens:', error);
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

// Start the app
const server = http.createServer(app);
server.listen(port, () => {
  console.log(`App running on port: ${port}`);
});
