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
import packageJson from '../package.json' with { type: 'json' };
import { google } from 'googleapis';
import axios from 'axios';

// Load environment variables
dotenv.config();

// Initialize Prisma client with singleton pattern for serverless
const globalForPrisma = globalThis;
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

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
  TELEGRAM_CHAT_ID,
  YOUTUBE_API_KEY
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
const serializeBigInt = (obj) => {
  return JSON.parse(JSON.stringify(obj, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
};

const getYoutubeClient = () => {
  return google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });
};

const sanitizeName = (filename) => {
  return filename
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
};

// Minimum video duration for livesets (10 minutes = 600 seconds)
// Colors is an exception - they have shorter single performances
const MIN_DURATION_SECONDS = 600;
const COLORS_CHANNEL_NAME = 'colors';

const isColorsChannel = (channelName) => {
  return sanitizeName(channelName || '') === COLORS_CHANNEL_NAME;
};

const getMinDuration = (channelName) => {
  return isColorsChannel(channelName) ? 60 : MIN_DURATION_SECONDS;
};

// Parse ISO 8601 duration (PT1H30M45S) to seconds
const parseDuration = (duration) => {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || 0, 10);
  const minutes = parseInt(match[2] || 0, 10);
  const seconds = parseInt(match[3] || 0, 10);
  return hours * 3600 + minutes * 60 + seconds;
};

const getAllVideosBetweenDates = async (channel, fromDate) => {
  const minDuration = getMinDuration(channel);
  const videos = await prisma.video.findMany({
    where: {
      channel: channel,
      publishedAt: {
        gte: new Date(fromDate).toISOString()
      },
      duration: {
        gte: minDuration
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
  const youtube = getYoutubeClient();
  let nextPageToken = '';
  let allUpsertedVideos = [];

  // Get channel info from YouTube API
  const channelResponse = await youtube.channels.list({
    part: 'snippet,statistics',
    id: channelId
  });

  const channelData = channelResponse.data.items[0];
  const channelName = channelData.snippet.title;
  const channelThumbnails = channelData.snippet.thumbnails;
  const subscriberCount = channelData.statistics?.subscriberCount || 0;
  const viewCount = channelData.statistics?.viewCount || 0;

  // Upsert channel (create if not exists, update if exists)
  await prisma.channels.upsert({
    where: { id: channelId },
    update: {
      updatedAt: new Date().toISOString(),
      thumbnails: JSON.stringify(channelThumbnails),
      channelName: channelName,
      subscriberCount: BigInt(subscriberCount),
      viewCount: BigInt(viewCount)
    },
    create: {
      id: channelId,
      subdomain: sanitizeName(channelName),
      channelName: channelName,
      updatedAt: new Date().toISOString(),
      thumbnails: JSON.stringify(channelThumbnails),
      subscriberCount: BigInt(subscriberCount),
      viewCount: BigInt(viewCount)
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
      const durationSeconds = parseDuration(details?.contentDetails?.duration);
      return prisma.video.upsert({
        where: { id: item.snippet.resourceId.videoId },
        update: {
          channel: sanitizeName(item.snippet.videoOwnerChannelTitle),
          channelId: item.snippet.videoOwnerChannelId,
          publishedAt: new Date(item.snippet.publishedAt).toISOString(),
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          title: item.snippet.title,
          viewCount: BigInt(details?.statistics?.viewCount || 0),
          duration: durationSeconds
        },
        create: {
          channel: sanitizeName(item.snippet.videoOwnerChannelTitle),
          channelId: item.snippet.videoOwnerChannelId,
          id: item.snippet.resourceId.videoId,
          publishedAt: new Date(item.snippet.publishedAt).toISOString(),
          thumbnails: JSON.stringify(item.snippet.thumbnails),
          title: item.snippet.title,
          viewCount: BigInt(details?.statistics?.viewCount || 0),
          duration: durationSeconds
        }
      });
    });

    const upsertedVideos = await Promise.all(upsertPromises);
    allUpsertedVideos = allUpsertedVideos.concat(upsertedVideos);
    console.log('Upserted videos progress: ', allUpsertedVideos.length, ' for channel: ', channelId);

    nextPageToken = response.data.nextPageToken;
  } while (nextPageToken);

  // Compute and store average view count for this channel (excluding shorts/short videos)
  const minDuration = getMinDuration(channelName);
  const channelVideos = await prisma.video.findMany({
    where: {
      channelId: channelId,
      duration: { gte: minDuration }
    },
    select: { viewCount: true }
  });

  if (channelVideos.length > 0) {
    const totalViews = channelVideos.reduce((sum, v) => sum + Number(v.viewCount), 0);
    const avgViewCount = Math.round(totalViews / channelVideos.length);

    await prisma.channels.update({
      where: { id: channelId },
      data: { avgViewCount: BigInt(avgViewCount) }
    });
  }

  return allUpsertedVideos;
};

// Cache helper for Vercel edge caching
const setCache = (res, seconds) => {
  res.set('Cache-Control', `s-maxage=${seconds}, stale-while-revalidate=${seconds * 2}`);
};

// API Routes
app.get("/version", (req, res) => {
  setCache(res, 3600); // 1 hour
  res.json({ version: packageJson.version });
});

app.get("/videos", async (req, res) => {
  const { fromdate: fromDate, channel } = req.query;

  if (!fromDate) {
    return res.status(400).json({ error: "fromdate parameter is required" });
  }

  try {
    setCache(res, 60); // 1 minute - videos update frequently
    const fromDateVideos = await getAllVideosBetweenDates(channel, fromDate);
    res.json(serializeBigInt({ channel, fromDateVideos }));
  } catch (error) {
    console.error('Error fetching videos:', error);
    res.status(500).json({ error: "An error occurred while fetching videos" });
  }
});

app.get("/available-channels", async (req, res) => {
  try {
    setCache(res, 1800); // 30 minutes - channels rarely change
    const channels = await prisma.channels.findMany();
    res.json(serializeBigInt({ channels }));
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: "An error occurred while fetching channels" });
  }
});

// Get featured videos - videos that performed exceptionally well compared to channel average
// Optional query param: days (default 14)
app.get("/featured-videos", async (req, res) => {
  try {
    setCache(res, 300); // 5 minutes - featured videos are computed
    const days = parseInt(req.query.days) || 14;
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);

    // Fetch recent videos and all channels in parallel
    // We fetch videos >= 60s (to include Colors), then filter by channel-specific duration later
    const [recentVideos, channels] = await Promise.all([
      prisma.video.findMany({
        where: {
          publishedAt: { gte: fromDate.toISOString() },
          duration: { gte: 60 } // Base filter, channel-specific filtering below
        },
        orderBy: { viewCount: 'desc' },
        take: 100 // Fetch more to account for filtering
      }),
      prisma.channels.findMany()
    ]);

    // Build channel lookup maps (by channelId and by sanitized name)
    const channelByIdMap = new Map(channels.map(c => [c.id, c]));
    const channelByNameMap = new Map(channels.map(c => [sanitizeName(c.channelName), c]));

    // Get all unique channel IDs that need avgViewCount computed
    const channelsNeedingAvg = new Set();
    for (const video of recentVideos) {
      const channelInfo = channelByIdMap.get(video.channelId) || channelByNameMap.get(video.channel);
      if (channelInfo && Number(channelInfo.avgViewCount) === 0) {
        channelsNeedingAvg.add(video.channelId);
      }
    }

    // Compute averages on-the-fly for channels that don't have it yet
    const computedAvgMap = new Map();
    if (channelsNeedingAvg.size > 0) {
      for (const channelId of channelsNeedingAvg) {
        const channelInfo = channelByIdMap.get(channelId);
        const minDuration = channelInfo ? getMinDuration(channelInfo.channelName) : MIN_DURATION_SECONDS;
        const channelVideos = await prisma.video.findMany({
          where: { channelId, duration: { gte: minDuration } },
          select: { viewCount: true },
          take: 100
        });
        if (channelVideos.length > 0) {
          const avg = channelVideos.reduce((sum, v) => sum + Number(v.viewCount), 0) / channelVideos.length;
          computedAvgMap.set(channelId, avg);
        }
      }
    }

    // Calculate scores using pre-computed or on-the-fly avgViewCount
    const videosWithScore = recentVideos.map(video => {
      // Try to find channel by ID first, then by name
      const channelInfo = channelByIdMap.get(video.channelId) || channelByNameMap.get(video.channel);

      if (!channelInfo) return null;

      // Check channel-specific minimum duration
      const minDuration = getMinDuration(channelInfo.channelName);
      if (video.duration < minDuration) return null;

      // Use pre-computed avgViewCount or fallback to on-the-fly computed
      let avgViews = Number(channelInfo.avgViewCount);
      if (avgViews === 0) {
        avgViews = computedAvgMap.get(video.channelId) || 0;
      }
      if (avgViews === 0) return null;

      const score = Number(video.viewCount) / avgViews;

      return {
        ...video,
        thumbnails: video.thumbnails,
        score,
        avgViews: Math.round(avgViews),
        channelThumbnail: channelInfo.thumbnails
      };
    });

    // Filter out nulls, sort by score (highest relative performance)
    // Always show top 3 videos (even if below average) to fill slots
    // Limit to 1 video per channel for diversity
    const seenChannels = new Set();
    const featured = videosWithScore
      .filter(v => v !== null)
      .sort((a, b) => b.score - a.score)
      .filter(v => {
        if (seenChannels.has(v.channel)) return false;
        seenChannels.add(v.channel);
        return true;
      })
      .slice(0, 3);

    res.json(serializeBigInt({ featured }));
  } catch (error) {
    console.error('Error fetching featured videos:', error);
    res.status(500).json({ error: "An error occurred while fetching featured videos" });
  }
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

  try {
    setCache(res, 300); // 5 minutes
    const channel = await prisma.channels.findUnique({
      where: { subdomain: sanitizedSubdomain },
    });
    res.json(serializeBigInt({ channel }));
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({ error: "An error occurred while fetching channel" });
  }
});

// Search for channels by name
// Single: /search-channels/Boiler%20Room
// Multiple: /search-channels/Boiler%20Room,Cercle,Mixmag
app.get("/search-channels/:channelNames", async (req, res) => {
  const { channelNames } = req.params;
  const searchTerms = channelNames.split(',').map(term => term.trim()).filter(Boolean);

  try {
    const youtube = getYoutubeClient();
    const results = [];

    for (const searchTerm of searchTerms) {
      const response = await youtube.search.list({
        part: 'snippet',
        q: searchTerm,
        type: 'channel',
        maxResults: 3
      });

      const channels = response.data.items.map(item => ({
        id: item.id.channelId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnails: item.snippet.thumbnails
      }));

      results.push({
        searchTerm,
        channels
      });
    }

    res.json({ results });
  } catch (error) {
    console.error('Error searching for channels:', error);
    res.status(500).json({ error: `An error occurred while searching for channels: ${error.errors?.[0]?.reason || error.message}` });
  }
});

// Example URL: /start-fill-database?channelid=UC_x5XG1OV2P6uZZ5FSM9Ttw
// Multiple channels: /start-fill-database?channelid=UC1,UC2,UC3
app.get("/start-fill-database", async (req, res) => {
  const { channelid: channelIdParam = '' } = req.query;
  try {
    if (!channelIdParam) {
      const oldestChannel = await refreshOldestChannelData();
      res.status(200).json(serializeBigInt({ message: "Refreshed oldest channel data successfully", oldestChannel }));
    } else {
      const channelIds = channelIdParam.split(',').map(id => id.trim()).filter(Boolean);
      const results = [];

      for (const channelId of channelIds) {
        try {
          const videos = await upsertVideosFromChannel(channelId);
          results.push({ channelId, success: true, videoCount: videos.length });
          console.log(`Added ${videos.length} videos for channel ${channelId}`);
        } catch (err) {
          results.push({ channelId, success: false, error: err.message });
          console.error(`Failed to add channel ${channelId}:`, err.message);
        }
      }

      const totalVideos = results.filter(r => r.success).reduce((sum, r) => sum + r.videoCount, 0);
      res.status(200).json({
        message: `Processed ${channelIds.length} channel(s) with ${totalVideos} total videos`,
        results
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "An error occurred while filling the database" });
  }
});

// Rebuild database - delete all videos and re-fetch from all channels
app.get("/rebuild-database", async (req, res) => {
  try {
    // Delete all videos
    const deleted = await prisma.video.deleteMany({});
    console.log(`Deleted ${deleted.count} videos`);

    // Get all channels
    const channels = await prisma.channels.findMany();

    // Re-fetch videos for each channel
    let totalVideos = 0;
    for (const channel of channels) {
      try {
        const videos = await upsertVideosFromChannel(channel.id);
        totalVideos += videos.length;
        console.log(`Rebuilt ${videos.length} videos for ${channel.channelName}`);
      } catch (err) {
        console.error(`Failed to rebuild ${channel.channelName}:`, err.message);
      }
    }

    res.status(200).json({
      message: "Database rebuilt successfully",
      deletedVideos: deleted.count,
      newVideos: totalVideos,
      channels: channels.length
    });
  } catch (error) {
    console.error('Error rebuilding database:', error);
    res.status(500).json({ error: "An error occurred while rebuilding the database" });
  }
});

// Delete a channel and all its videos
app.get("/delete-channel", async (req, res) => {
  const { channelid: channelId } = req.query;

  if (!channelId) {
    return res.status(400).json({ error: "channelid parameter is required" });
  }

  try {
    // Delete all videos from this channel
    const deletedVideos = await prisma.video.deleteMany({
      where: { channelId: channelId }
    });

    // Delete the channel
    const deletedChannel = await prisma.channels.delete({
      where: { id: channelId }
    });

    res.status(200).json({
      message: `Deleted channel ${deletedChannel.channelName} and ${deletedVideos.count} videos`
    });
  } catch (error) {
    console.error('Error deleting channel:', error);
    res.status(500).json({ error: "An error occurred while deleting the channel" });
  }
});

// Debug endpoint: condensed overview of all channels and their data status
app.get("/channel-status", async (req, res) => {
  try {
    const channels = await prisma.channels.findMany({
      orderBy: { updatedAt: 'asc' }
    });

    const statusPromises = channels.map(async (channel) => {
      const minDuration = getMinDuration(channel.channelName);
      const [totalVideos, qualifyingVideos, recentVideos] = await Promise.all([
        prisma.video.count({ where: { channelId: channel.id } }),
        prisma.video.count({ where: { channelId: channel.id, duration: { gte: minDuration } } }),
        prisma.video.count({
          where: {
            channelId: channel.id,
            duration: { gte: minDuration },
            publishedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString() }
          }
        })
      ]);

      const updatedAt = channel.updatedAt !== 'no_value' ? channel.updatedAt : null;
      const hoursAgo = updatedAt ? Math.round((Date.now() - new Date(updatedAt).getTime()) / 3600000) : null;

      return {
        name: channel.channelName,
        subdomain: channel.subdomain,
        id: channel.id,
        updatedAt: updatedAt,
        hoursAgo: hoursAgo !== null ? `${hoursAgo}h ago` : 'never',
        minDuration: `${minDuration}s`,
        totalVideos,
        qualifyingVideos,
        recentVideos14d: recentVideos,
        avgViewCount: Number(channel.avgViewCount)
      };
    });

    const status = await Promise.all(statusPromises);

    res.json({
      channelCount: channels.length,
      channels: status
    });
  } catch (error) {
    console.error('Error fetching channel status:', error);
    res.status(500).json({ error: "An error occurred while fetching channel status" });
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
    res.status(200).send('Authentication successful! You can close this window.');
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
