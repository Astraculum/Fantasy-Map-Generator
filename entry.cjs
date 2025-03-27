const express = require('express');
const puppeteer = require('puppeteer');
const path = require('path');
const http = require('http');
const fs = require('fs');

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
	const browser = await puppeteer.launch({ headless: false }); // Open in non-headless mode for debugging
	const page = await browser.newPage();

	// Get CDP session and set download directory
	const client = await page.target().createCDPSession();
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

	// Call exportToJson to trigger download
	const exportResult = await page.evaluate(() => exportToJson('Full'));
	console.log('exportToJson returned:', exportResult);

	// Let Puppeteer wait for file download to complete (optional)
	// await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds to ensure download completes

	// Close Puppeteer and server
	await browser.close();
	server.close(() => {
		console.log('Server closed.');
	});

	console.log(`JSON file should have been downloaded to: ${downloadPath}`);
})();


