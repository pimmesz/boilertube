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
import puppeteer, { ConsoleMessage } from "puppeteer";

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

app.get("/get-genres", async (req, res, next) => {
	const videos = await prisma.video.findMany();
	const genres = videos.reduce((previousValues, currentValue) => {
		if (currentValue.genres) {
			const genres = JSON.parse(currentValue.genres).split(",");
			if (
				genres.length >= 1 &&
				!previousValues.some((genre) => genres.includes(genre))
			) {
				previousValues.push(...genres);
			}
		}
		return previousValues;
	}, []);

	res.send(
		JSON.stringify({
			genres,
		})
	);
});

app.get("/start-fill-database", async (req, res, next) => {
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
			genres: "",
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

async function updateVideosWithGenres(video) {
	try {
		await prisma.video.update({
			where: {
				id: video.id,
			},
			data: {
				genres: JSON.stringify(video.genres),
			},
		});
	} catch (error) {
		console.log("updateVideosWithGenres failed");
	}
}

async function saveOrUpdateVideosWithDetails(video) {
	try {
		await prisma.video.upsert({
			where: {
				id: video.id,
			},
			update: {
				viewCount: video.viewCount,
			},
			create: {
				...video,
			},
		});
	} catch (error) {
		console.log("saveOrUpdateVideosWithDetails failed");
	}
}

function getVideoInfoPerYoutubePage(
	pageToken = "",
	allowLoop = true,
	iteration = 0
) {
	// If pageToken is provided, use it to get the next page of videos
	// Otherwise, get the first page of videos
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

					return await saveOrUpdateVideosWithDetails(videoDetails);
				})
			);

			await scrapeGenres(items);

			if (nextPageToken && allowLoop) {
				iteration++;
				console.log("iteration - ", iteration);
				console.log("videos in database - ", await prisma.video.count());
				getVideoInfoPerYoutubePage(nextPageToken, allowLoop, iteration);
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
	}
}

// Start the app
async function scrapeGenres(videos) {
	try {
		const puppeteerOptions =
			process.env.ENVIRONMENT === "production"
				? {
						executablePath: "chromium-browser",
				  }
				: {};

		const browser = await puppeteer.launch(puppeteerOptions);
		const page = await browser.newPage();

		for (let i = 0; i < videos.length; i++) {
			try {
				const existingVideo = await prisma.video.findMany({
					where: {
						id: videos[i].snippet.resourceId.videoId,
					},
				});

				console.log("Video already has genres - ", existingVideo.genres);
				if (!existingVideo || existingVideo.length < 1) continue;
				await page.goto(`https://boilerroom.tv/?s=${videos[i].snippet.title}`);
				await page.waitForSelector("#app");

				const genres = await page.evaluate(() => {
					const elements = Array.from(
						document
							?.querySelector("[class*='BroadcastGenres-BroadcastGenres']")
							?.querySelectorAll("span")
					);
					if (elements && elements.length <= 0) return;
					return elements.map((genreSpan) => genreSpan.innerText);
				});

				if (genres && genres?.length > 0) {
					console.log("Found genres", genres, "for", videos[i].snippet.title);
					const video = Object.assign(
						{ id: videos[i].snippet.resourceId.videoId },
						{
							genres: `${genres}`,
						}
					);
					await updateVideosWithGenres(video);
				}
			} catch (error) {
				console.log("Could't find genre for - ", videos[i].snippet.title);
			}
		}

		await browser.close();
	} catch (e) {
		console.log("scrapeGenres", e);
	}
}

const server = http.createServer(app);
server.listen(port, async () => {
	console.log(`App running on port: ${port}`);
	cron.schedule("0 0 0 * * *", async () => {
		console.log("Run loop at " + moment().format("MMMM Do YYYY, h:mm:ss a"));
		await startBoilertube();
	});
});
