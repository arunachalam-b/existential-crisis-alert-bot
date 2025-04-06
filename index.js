// index.js
require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { TwitterApi } = require('twitter-api-v2');

// --- Configuration ---
const TECHMEME_URL = 'https://techmeme.com';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TWITTER_CONFIG = {
    appKey: process.env.TWITTER_API_KEY,
    appSecret: process.env.TWITTER_API_SECRET,
    accessToken: process.env.TWITTER_ACCESS_TOKEN,
    accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
};

// --- Input Validation ---
if (!GEMINI_API_KEY) {
    console.error('Error: GEMINI_API_KEY is missing in your .env file.');
    process.exit(1);
}
if (!TWITTER_CONFIG.appKey || !TWITTER_CONFIG.appSecret || !TWITTER_CONFIG.accessToken || !TWITTER_CONFIG.accessSecret) {
    console.error('Error: One or more Twitter API credentials are missing in your .env file.');
    process.exit(1);
}

// --- Initialize Clients ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const twitterClient = new TwitterApi(TWITTER_CONFIG);
// Use .v2.user to make requests in the context of the user (posting tweets)
const twitterUserClient = twitterClient.v2.user;

// --- Helper Functions ---

/**
 * Fetches HTML content from a given URL.
 * @param {string} url - The URL to fetch.
 * @returns {Promise<string>} - The HTML content.
 */
async function fetchHtml(url) {
    console.log(`Fetching HTML from ${url}...`);
    try {
        const response = await axios.get(url, {
            headers: {
                // Mimic a browser user agent to avoid potential blocks
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        if (response.status !== 200) {
            throw new Error(`Failed to fetch HTML: Status code ${response.status}`);
        }
        console.log('HTML fetched successfully.');
        return response.data;
    } catch (error) {
        console.error(`Error fetching HTML from ${url}:`, error.message);
        throw error; // Re-throw to be caught by the main function
    }
}

/**
 * Uses Gemini API to extract AI news from HTML.
 * @param {string} htmlContent - The HTML content of the webpage.
 * @returns {Promise<Array<{title: string, link: string, hashtags: string[]}>>} - Array of news items.
 */
async function extractAiNewsWithGemini(htmlContent) {
    console.log('Sending HTML to Gemini for AI news extraction...');
    try {
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // IMPORTANT: Carefully craft the prompt for structured output
        const prompt = `
            Analyze the following HTML content from techmeme.com. Identify the top 3 news headlines specifically related to Artificial Intelligence (AI), Machine Learning (ML), Large Language Models (LLMs), Generative AI, or significant AI company news (like OpenAI, Anthropic, Google AI, Meta AI, etc.).

            For each of the top 3 AI news items, provide:
            1. The main headline text (title).
            2. A short description (not exceeding 80 characters) summarizing the news.
            3. The direct URL (link) associated with that headline on Techmeme.
            4. A list of 1-3 relevant hashtags (e.g., #AI, #MachineLearning, #LLM, #GenAI, #Funding, #Research, #OpenAI).

            Return the result ONLY as a JSON array of objects, where each object has the keys "title", "link", and "hashtags" (which is an array of strings). Do not include any explanations, or markdown formatting around the JSON.

            HTML Content:
            \`\`\`html
            ${htmlContent} // Send a reasonable chunk to avoid exceeding limits
            \`\`\`
        `;
        // ${htmlContent.substring(0, 100000)} // Send a reasonable chunk to avoid exceeding limits

        const result = await model.generateContent({
            contents: prompt,
            generationConfig: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        'intro': {
                            type: Type.STRING,
                            description: 'Introduction to the post',
                            nullable: false,
                        },
                        'news_items': {
                            type: Type.ARRAY,
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                    'title': {
                                        type: Type.STRING,
                                        description: 'Title of the news',
                                        nullable: false,
                                    },
                                    'short_description': {
                                        type: Type.STRING,
                                        description: 'Short description of the news not exceeding 80 characters',
                                        nullable: false,
                                    },
                                    'link': {
                                        type: Type.STRING,
                                        description: 'Link to the news article',
                                        nullable: false,
                                    },
                                    'hashtags': {
                                        type: Type.ARRAY,
                                        items: {
                                            type: Type.STRING,
                                            description: 'Hashtags related to the news',
                                            nullable: false,
                                        },
                                        minItems: 1,
                                        maxItems: 3,
                                    },
                                },
                                required: ['title', 'link', 'hashtags'],
                            },
                        },
                        'outro': {
                            type: Type.STRING,
                            description: 'Conclusion of the post',
                            nullable: false,
                        }
                    },
                }
            }
        });
        const response = await result.response;
        const text = response.text();

        console.log('Gemini response received. ============ ', text);
        // Clean the response text to ensure it's valid JSON
        let cleanedText = text.trim();
        // Remove potential markdown code block fences
        if (cleanedText.startsWith('```json')) {
            cleanedText = cleanedText.substring(7);
        }
        if (cleanedText.endsWith('```')) {
            cleanedText = cleanedText.substring(0, cleanedText.length - 3);
        }
        cleanedText = cleanedText.trim();


        // Attempt to parse the JSON
        let newsItems;
        try {
             newsItems = JSON.parse(cleanedText);
        } catch (parseError) {
            console.error('Error parsing JSON response from Gemini:', parseError);
            console.error('Raw Gemini response text:', text); // Log raw response for debugging
            throw new Error('Failed to parse structured data from Gemini.');
        }


        // Basic validation
        if (!Array.isArray(newsItems)) {
             throw new Error('Gemini response was not a JSON array.');
        }
         if (newsItems.length === 0) {
            console.warn('Gemini did not find any AI news items.');
            return [];
        }
        // Ensure items have the expected structure (optional but good practice)
        newsItems.forEach((item, index) => {
            if (!item.title || !item.link || !item.hashtags || !Array.isArray(item.hashtags)) {
                 console.warn(`News item at index ${index} has missing or invalid fields:`, item);
                 // You might choose to filter out invalid items here
            }
             // Ensure links are absolute
            if(item.link && item.link.startsWith('/')) {
                item.link = `https://techmeme.com${item.link}`;
            }
        });

        console.log(`Extracted ${newsItems.length} AI news items.`);
        return newsItems.slice(0, 3); // Ensure we only take max 3

    } catch (error) {
        console.error('Error interacting with Gemini API:', error.message);
        if (error.response) { // Log more details if available from Gemini
            console.error('Gemini Error Details:', error.response);
        }
        throw error;
    }
}

/**
 * Posts news items as a Twitter thread.
 * @param {Array<{title: string, link: string, hashtags: string[]}>} newsItems - Array of news items.
 */
async function postNewsToTwitter(newsItems) {
    if (!newsItems || newsItems.length === 0) {
        console.log('No news items to post.');
        return;
    }

    console.log(`Posting ${newsItems.length} news items to Twitter as a thread...`);

    let previousTweetId = null;

    for (let i = 0; i < newsItems.length; i++) {
        const item = newsItems[i];
        const hashtagString = item.hashtags.join(' ');
        // Construct tweet text - carefully manage length if needed
        let tweetText = `${item.title}\n\n${item.link}\n\n${hashtagString}`;

        // Add thread indicator (optional but good practice)
         if (newsItems.length > 1) {
            tweetText += `\n\n(${i + 1}/${newsItems.length})`;
         }

        // Ensure tweet doesn't exceed character limits (basic check)
        if (tweetText.length > 280) {
            console.warn(`Tweet ${i+1} might be too long (${tweetText.length} chars), attempting to post anyway...`);
            // You could implement truncation logic here if necessary
        }

        try {
            console.log(`Posting tweet ${i + 1}: ${item.title}`);
            const postOptions = { text: tweetText };

            // If this is not the first tweet, reply to the previous one to create a thread
            if (previousTweetId) {
                postOptions.reply = { in_reply_to_tweet_id: previousTweetId };
            }

            const { data: createdTweet } = await twitterUserClient.tweet(postOptions);
            console.log(`Tweet ${i + 1} posted successfully! ID: ${createdTweet.id}`);
            previousTweetId = createdTweet.id; // Store ID for the next iteration

            // Add a small delay between tweets to avoid rate limiting issues (optional but recommended)
            if (i < newsItems.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 2000)); // 2-second delay
            }

        } catch (error) {
            console.error(`Error posting tweet ${i + 1}:`, error.message || error);
             if (error.data) { // Twitter API often provides details in error.data
                console.error("Twitter API Error Details:", error.data);
             }
            // Decide if you want to stop the thread on error or continue
            // For now, we'll stop.
             console.error('Aborting further posts due to error.');
             break;
        }
    }
     console.log('Finished posting thread.');
}


// --- Main Execution Logic ---
async function main() {
    try {
        // 1. Get HTML from Techmeme
        const html = await fetchHtml(TECHMEME_URL);

        // 2. Extract AI news using Gemini
        const aiNews = await extractAiNewsWithGemini(html);

        console.log("AI News ============= ", aiNews);

        if (aiNews && aiNews.length > 0) {
             // 3. Post news to Twitter
            // await postNewsToTwitter(aiNews);
            console.log("Successfully fetched news and posted to Twitter.");
        } else {
            console.log("No AI news found or extracted. Nothing posted to Twitter.");
        }

    } catch (error) {
        console.error('------------------------------------');
        console.error('An error occurred during execution:');
        console.error(error.message || error);
        console.error('------------------------------------');
        process.exit(1); // Exit with error code
    }
}

// Run the main function
main();
