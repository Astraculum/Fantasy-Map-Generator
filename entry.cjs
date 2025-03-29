const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

const options = {
	pinNotes: false,
	winds: [225, 45, 225, 315, 135, 315],
	temperatureEquator: 27,
	temperatureNorthPole: -30,
	temperatureSouthPole: -15,
	stateLabelsMode: "auto",
	showBurgPreview: true,
	villageMaxPopulation: 2000

};


(async () => {
	// Create download directory (if it doesn't exist)
	const downloadPath = path.resolve(__dirname, 'downloads');
	if (!fs.existsSync(downloadPath)) {
		fs.mkdirSync(downloadPath);
	}

	// Start Express server
	const app = express();
	app.use(express.static(path.join(__dirname)));
	const server = http.createServer(app);
	const PORT = 3000;
	await new Promise((resolve, reject) => {
		server.listen(PORT, (err) => {
			if (err) reject(err);
			else {
				console.log(`Server started: http://localhost:${PORT}`);
				resolve();
			}
		});
	});

	// Launch Puppeteer
	const browser = await puppeteer.launch({ headless: true }); // Open in non-headless mode for debugging
	const page = await browser.newPage();

	// Get CDP session and set download directory
	const client = await page.createCDPSession();
	await client.send('Page.setDownloadBehavior', {
		behavior: 'allow',
		downloadPath: downloadPath
	});

	// Load page
	const url = `http://localhost:${PORT}/index.html`;
	await page.goto(url, { waitUntil: 'networkidle0' });

	// Call generate function (if needed)
	const genResult = await page.evaluate(() => generate());
	console.log('generate returned:', genResult);

	// Function to wait for file download
	const waitForDownload = (timeout = 30000) => {
		return new Promise((resolve) => {
			const startTime = Date.now();
			const initialFiles = fs.readdirSync(downloadPath);

			const checkDownload = () => {
				const currentFiles = fs.readdirSync(downloadPath);
				const newFiles = currentFiles.filter(file => !initialFiles.includes(file));

				if (newFiles.length > 0) {
					// Check if file is still being written (file size changes)
					const filePath = path.join(downloadPath, newFiles[0]);
					const fileSizeBefore = fs.statSync(filePath).size;

					setTimeout(() => {
						const fileSizeAfter = fs.statSync(filePath).size;
						if (fileSizeBefore === fileSizeAfter) {
							console.log(`Download completed: ${newFiles[0]}`);
							resolve(filePath);
						} else {
							checkDownload();
						}
					}, 100);
				} else if (Date.now() - startTime < timeout) {
					setTimeout(checkDownload, 100);
				} else {
					console.log('Download timed out');
					resolve(null);
				}
			};

			checkDownload();
		});
	};
	const stats = await page.evaluate(() => {
		const heightmap = byId("templateInput").value;
		const isTemplate = heightmap in heightmapTemplates;
		const heightmapType = isTemplate ? "template" : "precreated";
		const isRandomTemplate = isTemplate && !locked("template") ? "random " : "";

		// Generate unique mapId just like in showStatistics
		const mapId = Date.now();

		return {
			seed: seed,
			graphWidth: graphWidth,
			graphHeight: graphHeight,
			template: heightmap,
			templateType: `${isRandomTemplate}${heightmapType}`,
			points: grid.points.length,
			cells: pack.cells.i.length,
			mapSize: mapSizeOutput.value,
			states: pack.states.length - 1,
			provinces: pack.provinces.length - 1,
			burgs: pack.burgs.length - 1,
			religions: pack.religions.length - 1,
			culturesSet: culturesSet.value,
			cultures: pack.cultures.length - 1,
			mapId: mapId
		};
	});

	console.log('Map statistics:', stats);
	// Call exportToJson to trigger download and wait for it
	console.log('Starting JSON export...');
	const exportResult = await page.evaluate(() => exportToJson('Full'));
	console.log('exportToJson returned:', exportResult);

	// Wait for the download to complete
	const downloadedFile = await waitForDownload();

	// Close Puppeteer and server
	await browser.close();
	server.close(() => {
		console.log('Server closed.');
	});

	if (downloadedFile) {
		console.log(`JSON file successfully downloaded to: ${downloadedFile}`);
	} else {
		console.error(`Failed to download JSON file to: ${downloadPath}`);
	}
})().catch(err => {
	console.error('Error occurred:', err);
	process.exit(1);
});


