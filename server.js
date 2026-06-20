const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { ApifyClient } = require('apify-client');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const APIFY_API_TOKEN =
    process.env.APIFY_API_TOKEN || 'apify_api_bh6GJT2m7bPlNxVTYKMI5Bzcxd6nrX1rfNdO';

const GOOGLE_MAPS_URL =
    process.env.GOOGLE_MAPS_URL ||
    'https://www.google.com/maps/place/Traikos+Finance/@-37.9725665,145.0531353,9z/data=!4m18!1m9!3m8!1s0x68fb5a82afcd107f:0x3586daeb8b74dd84!2sTraikos+Finance!8m2!3d-37.9725665!4d145.0531353!9m1!1b1!16s%2Fg%2F11y98lnzt6!3m7!1s0x68fb5a82afcd107f:0x3586daeb8b74dd84!8m2!3d-37.9725665!4d145.0531353!9m1!1b1!16s%2Fg%2F11y98lnzt6?entry=ttu';

const allowedOrigins = ['https://traikosfinance.com', 'http://localhost:5173'];
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    }
}));

const DATA_DIR = path.join(__dirname, 'data');
const FILE_PATH = path.join(DATA_DIR, 'reviews.json');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

const client = new ApifyClient({
    token: APIFY_API_TOKEN,
});

const formatReviewDate = (review) => {
    if (review.publishedAtDate) {
        return new Date(review.publishedAtDate).toLocaleDateString();
    }
    return review.publishedAt;
};

const fetchAndSaveReviews = async () => {
    console.log(`[${new Date().toISOString()}] Starting Apify Scraper...`);

    const input = {
        startUrls: [{ url: GOOGLE_MAPS_URL }],
        maxReviews: 100,
        language: 'en',
    };

    try {
        const run = await client.actor('compass/google-maps-reviews-scraper').call(input);
        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (items && items.length > 0) {
            const reviews = items.map((review) => ({
                author_name: review.name,
                profile_photo_url: review.reviewerPhotoUrl || review.profilePicture,
                rating: review.stars ?? review.rating,
                text: review.text,
                relative_time_description: formatReviewDate(review),
            }));

            fs.writeFileSync(FILE_PATH, JSON.stringify(reviews, null, 2));
            console.log(`[${new Date().toISOString()}] Successfully saved ${reviews.length} reviews!`);
            return { success: true, count: reviews.length };
        }

        console.log('No reviews found from Apify.');
        return { success: true, count: 0, message: 'No reviews found from Apify.' };
    } catch (error) {
        console.error('Error extracting reviews from Apify:', error);
        return { success: false, message: error.message };
    }
};

cron.schedule('0 0 * * 1,3,6', () => {
    fetchAndSaveReviews();
});

app.get('/', (req, res) => {
    res.send('Server is running');
});

app.get('/api/reviews', (req, res) => {
    try {
        if (fs.existsSync(FILE_PATH)) {
            const rawData = fs.readFileSync(FILE_PATH);
            const reviews = JSON.parse(rawData);
            res.status(200).json({ success: true, data: reviews });
        } else {
            res.status(200).json({ success: true, data: [], message: 'No reviews fetched yet.' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

app.get('/api/trigger-update', async (req, res) => {
    const result = await fetchAndSaveReviews();
    res.json({
        message: result.success
            ? `Update complete. Saved ${result.count ?? 0} reviews.`
            : 'Update failed.',
        ...result,
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
