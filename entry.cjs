const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

// Map generation options
const mapOptions = {
	seed: "AgentMatrix2025",             // Custom seed
	heightmap: "highIsland",            // Heightmap template
	mapSize: 65,                         // Map size percentage
	culturesSet: "european",             // Culture set
	points: 12000,                       // Number of points/cells
	temperatureEquator: 30,              // Custom temperature at equator
	latitudeValue: 45,                   // Latitude
	longitudeValue: 50,                   // Longitude
	pinNotes: false,
	winds: [225, 45, 225, 315, 135, 315],
	temperatureEquator: 27,
	temperatureNorthPole: -30,
	temperatureSouthPole: -15,
	stateLabelsMode: "auto",
	showBurgPreview: true,
	villageMaxPopulation: 2000
};
// volcano: {id: 0, name: "Volcano", template: volcano, probability: 3},
// highIsland: {id: 1, name: "High Island", template: highIsland, probability: 19},
// lowIsland: {id: 2, name: "Low Island", template: lowIsland, probability: 9},
// continents: {id: 3, name: "Continents", template: continents, probability: 16},
// archipelago: {id: 4, name: "Archipelago", template: archipelago, probability: 18},
// atoll: {id: 5, name: "Atoll", template: atoll, probability: 1},
// mediterranean: {id: 6, name: "Mediterranean", template: mediterranean, probability: 5},
// peninsula: {id: 7, name: "Peninsula", template: peninsula, probability: 3},
// pangea: {id: 8, name: "Pangea", template: pangea, probability: 5},
// isthmus: {id: 9, name: "Isthmus", template: isthmus, probability: 2},
// shattered: {id: 10, name: "Shattered", template: shattered, probability: 7},
// taklamakan: {id: 11, name: "Taklamakan", template: taklamakan, probability: 1},
// oldWorld: {id: 12, name: "Old World", template: oldWorld, probability: 8},
// fractious: {id: 13, name: "Fractious", template: fractious, probability: 3}
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
	const browser = await puppeteer.launch({ headless: true });
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

	// Set form values and inject options before map generation
	await page.evaluate((mapOptions) => {
		// Set seed
		document.getElementById("optionsSeed").value = mapOptions.seed;

		// Set heightmap template
		document.getElementById("templateInput").value = mapOptions.heightmap;

		// Set map size
		document.getElementById("mapSizeInput").value = mapOptions.mapSize;
		document.getElementById("mapSizeOutput").value = mapOptions.mapSize;

		// Set cultures set
		document.getElementById("culturesSet").value = mapOptions.culturesSet;

		// Set points/cells
		document.getElementById("pointsInput").value = mapOptions.points;
		document.getElementById("pointsInput").dataset.cells = mapOptions.points;

		// Set temperature at equator
		document.getElementById("temperatureEquatorOutput").value = mapOptions.temperatureEquator;
		document.getElementById("temperatureEquatorInput").value = mapOptions.temperatureEquator;

		// Set latitude and longitude
		document.getElementById("latitudeInput").value = mapOptions.latitudeValue;
		document.getElementById("latitudeOutput").value = mapOptions.latitudeValue;
		document.getElementById("longitudeInput").value = mapOptions.longitudeValue;
		document.getElementById("longitudeOutput").value = mapOptions.longitudeValue;

		// Lock options to prevent randomization
		if (window.lockOption) {
			window.lockOption("template");
			window.lockOption("mapSize");
			window.lockOption("latitude");
			window.lockOption("longitude");
		}

	}, mapOptions);

	// Call generate function with our options
	console.log('Starting map generation with seed:', mapOptions.seed);
	const genResult = await page.evaluate((seed) => {
		// Pass seed directly to generate function
		return generate({ seed: seed });
	}, mapOptions.seed);

	console.log('Map generation complete');

	// Extract map statistics
	const stats = await page.evaluate(() => {
		const heightmap = byId("templateInput").value;
		const isTemplate = heightmap in heightmapTemplates;
		const heightmapType = isTemplate ? "template" : "precreated";
		const isRandomTemplate = isTemplate && !locked("template") ? "random " : "";

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
			cultures: pack.cultures.length - 1
		};
	});

	// Format the statistics as in the showStatistics() function
	console.log("\n=== MAP STATISTICS ===");
	console.log(`Seed: ${stats.seed}`);
	console.log(`Canvas size: ${stats.graphWidth}x${stats.graphHeight} px`);
	console.log(`Heightmap: ${stats.template}`);
	console.log(`Template: ${stats.templateType}`);
	console.log(`Points: ${stats.points}`);
	console.log(`Cells: ${stats.cells}`);
	console.log(`Map size: ${stats.mapSize}%`);
	console.log(`States: ${stats.states}`);
	console.log(`Provinces: ${stats.provinces}`);
	console.log(`Burgs: ${stats.burgs}`);
	console.log(`Religions: ${stats.religions}`);
	console.log(`Culture set: ${stats.culturesSet}`);
	console.log(`Cultures: ${stats.cultures}`);
	console.log("=====================\n");

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

// Function to wait for file download
const waitForDownload = (timeout = 30000) => {
	return new Promise((resolve) => {
		const startTime = Date.now();
		const initialFiles = fs.readdirSync(path.resolve(__dirname, 'downloads'));

		const checkDownload = () => {
			const currentFiles = fs.readdirSync(path.resolve(__dirname, 'downloads'));
			const newFiles = currentFiles.filter(file => !initialFiles.includes(file));

			if (newFiles.length > 0) {
				// Check if file is still being written (file size changes)
				const filePath = path.join(path.resolve(__dirname, 'downloads'), newFiles[0]);
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


