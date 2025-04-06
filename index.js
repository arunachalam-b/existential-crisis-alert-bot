// index.js
require("dotenv").config(); // Load environment variables from .env file
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs").promises; // Use promise-based fs
const path = require("path");
const os = require("os"); // To get temporary directory
const { GoogleGenerativeAI, SchemaType } = require("@google/generative-ai");
const { TwitterApi } = require("twitter-api-v2");
const {
  GoogleAIFileManager,
  FileState,
} = require("@google/generative-ai/server");
const {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
} = require("@google/genai");

// --- Configuration ---
const TECHMEME_URL = "https://techmeme.com";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TWITTER_CONFIG = {
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
};

// --- Input Validation ---
if (!GEMINI_API_KEY) {
  console.error("Error: GEMINI_API_KEY is missing in your .env file.");
  process.exit(1);
}
if (
  !TWITTER_CONFIG.appKey ||
  !TWITTER_CONFIG.appSecret ||
  !TWITTER_CONFIG.accessToken ||
  !TWITTER_CONFIG.accessSecret
) {
  console.error(
    "Error: One or more Twitter API credentials are missing in your .env file."
  );
  process.exit(1);
}

// --- Initialize Clients ---
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const twitterClient = new TwitterApi(TWITTER_CONFIG);
// Use .v2.user to make requests in the context of the user (posting tweets)
const twitterUserClient = twitterClient.readWrite;

// --- Helper Functions ---

const convertToBoldText = (text) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ", bold_chars = "𝗔𝗕𝗖𝗗𝗘𝗙𝗚𝗛𝗜𝗝𝗞𝗟𝗠𝗡𝗢𝗣𝗤𝗥𝗦𝗧𝗨𝗩𝗪𝗫𝗬𝗭𝗮𝗯𝗰𝗱𝗲𝗳𝗴𝗵𝗶𝗷𝗸𝗹𝗺𝗻𝗼𝗽𝗾𝗿𝘀𝘁𝘂𝘃𝘄𝘅𝘆𝘇𝟬𝟭𝟮𝟯𝟰𝟱𝟲𝟳𝟴𝟵 ";
    const boldText = text.split("").map(char => {
        const index = chars.indexOf(char);
        return index !== -1 ? bold_chars[index] : char;
    }).join("");
    return boldText;
};

function translate (char)
{
    let diff;
    if (/[A-Z]/.test (char))
    {
        diff = "𝗔".codePointAt (0) - "A".codePointAt (0);
    }
    else if (/[a-z]/.test(char))
    {
        diff = "𝗮".codePointAt (0) - "a".codePointAt (0);
    } else if (/[0-9]/.test(char)) {
        diff = "𝟎".codePointAt (0) - "0".codePointAt (0);
    }
    return String.fromCodePoint (char.codePointAt (0) + diff);
}

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
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch HTML: Status code ${response.status}`);
    }
    console.log("HTML fetched successfully.");
    // Load the HTML content into Cheerio
    // const $ = cheerio.load(response.data);
    // // Extract the body content
    // const bodyContent = $('body').html();
    // return bodyContent;
    return response.data; // Return the full HTML content
  } catch (error) {
    console.error(`Error fetching HTML from ${url}:`, error.message);
    throw error; // Re-throw to be caught by the main function
  }
}

/**
 * Uploads HTML content as a file to the Gemini File API.
 * @param {string} htmlContent - The HTML string content.
 * @param {string} filename - The desired filename for the upload.
 * @returns {Promise<object>} - The file metadata object returned by the API.
 */
async function uploadHtmlToGemini(htmlContent, filename = "techmeme.html") {
  console.log(`Uploading ${filename} to Gemini File API...`);
  const tempFilePath = path.join(os.tmpdir(), filename); // Create temp file path

  try {
    // 1. Write HTML content to a temporary file
    await fs.writeFile(tempFilePath, htmlContent);
    console.log(`HTML saved temporarily to ${tempFilePath}`);

    // 2. Upload the file using the SDK
    // Use genAI.uploadFile directly
    // const uploadResult = await genAI.uploadFile(tempFilePath, {
    //      mimeType: 'text/html', // Crucial: Specify the content type
    //      displayName: filename
    // });
    // const fileManager = new GoogleAIFileManager(process.env.API_KEY);

    // const uploadResult = await fileManager.uploadFile(
    //     tempFilePath,
    //   {
    //     mimeType: '	text/plain',
    //     displayName: filename
    //   },
    // );
    // // View the response.
    // console.log(
    //   `Uploaded file ${uploadResult.file.displayName} as: ${uploadResult.file.uri}`,
    // );

    const uploadResult = await ai.files.upload({
      file: tempFilePath,
      config: {
        mimeType: "	text/html",
        displayName: filename,
      },
    });

    console.log(
      //   `File uploaded successfully. File Name: ${uploadResult.file.name}, URI: ${uploadResult.file.uri}`
      uploadResult
    );

    // Optional: Clean up the temporary file immediately after successful upload
    await fs.unlink(tempFilePath);
    console.log(`Temporary file ${tempFilePath} deleted.`);

    return uploadResult; // Return the file metadata
  } catch (error) {
    console.error("Error during file upload to Gemini:", error);
    // Attempt to clean up the temp file even if upload failed
    try {
      await fs.access(tempFilePath); // Check if file exists before unlinking
      await fs.unlink(tempFilePath);
      console.log(`Temporary file ${tempFilePath} cleaned up after error.`);
    } catch (cleanupError) {
      // Ignore cleanup errors if the file doesn't exist or can't be deleted
      console.warn(
        `Could not cleanup temporary file ${tempFilePath}: ${cleanupError.message}`
      );
    }
    throw new Error(
      `Failed to upload file to Gemini File API: ${error.message}`
    );
  }
}

/**
 * Uses Gemini API to extract AI news from HTML.
 * @param {string} htmlContent - The HTML content of the webpage.
 * @returns {Promise<Array<{title: string, link: string, hashtags: string[]}>>} - Array of news items.
 */
async function extractAiNewsWithGemini(uploadedFile) {
  console.log("Sending HTML to Gemini for AI news extraction...");
  try {
    // const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // IMPORTANT: Carefully craft the prompt for structured output
    const prompt = `
            Analyze the content of the provided HTML file (${uploadedFile.displayName}), which contains the Techmeme homepage. Identify the top 3 news headlines specifically related to Artificial Intelligence (AI), Machine Learning (ML), Large Language Models (LLMs), Generative AI, or significant AI company news (like OpenAI, Anthropic, Google AI, Meta AI, etc.).

            For each of the top 3 AI news items, provide:
            1. The main headline text (title).
            2. A short description (not exceeding 80 characters) summarizing the news.
            3. The direct URL (link) associated with that headline on Techmeme.
            4. A list of 1-3 relevant hashtags (e.g., #AI, #MachineLearning, #LLM, #GenAI, #Funding, #Research, #OpenAI).

            Return the result ONLY as a JSON array of objects, where each object has the keys "title", "short_description", "link", and "hashtags" (which is an array of strings). Do not include any explanations around the JSON. However, you may include emojis. 

            Also, give me a short content before these lines to start with and give me a short content asking the user to follow to receive more content at the end. 

            Here's an example: 
            Intro:
            From big price tags to free college perks, the AI world isn’t slowing down. Here are today’s top 3 stories you should know:

            Top 3 AI News:

            1️⃣ Google's Gemini 2.5 Pro Comes with a Premium Price Tag 💰
            Google reveals pricing for Gemini 2.5 Pro—its most expensive model yet—at $1.25 per million input tokens and $10 per million output tokens.
            (Source: TechCrunch – Maxwell Zeff)
            Because what's cutting-edge AI without a price that cuts deep?

            2️⃣ OpenAI Gives ChatGPT Plus to College Students for Free 🎓
            College students in the US and Canada can now access ChatGPT Plus for free until May 2025, in a clear jab at Anthropic’s campus push.
            (Source: VentureBeat – Michael Nuñez)
            Nothing says “future of education” like AI doing your homework—for free.

            3️⃣ Midjourney V7 Enters Alpha With a Whole New Brain 🧠
            Midjourney launches V7 in alpha, its first major model update in nearly a year, built on a “totally different architecture.”
            (Source: TechCrunch – Kyle Wiggers)
            Just when you mastered prompts, they dropped a new engine like it’s Fast & Furious: AI Drift.

            Outro:
            That’s a wrap on today’s AI buzz. Follow for more quick updates—minus the fluff. ⚡
        `;
    // ${htmlContent.substring(0, 100000)} // Send a reasonable chunk to avoid exceeding limits
    // ${htmlContent}

    const fileDataPart = {
      fileData: {
        mimeType: uploadedFile.mimeType,
        fileUri: uploadedFile.uri,
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [
        createUserContent([
          prompt,
          createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        ]),
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: SchemaType.OBJECT,
          properties: {
            intro: {
              type: SchemaType.STRING,
              description: "Introduction to the post",
              nullable: false,
            },
            news_items: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  title: {
                    type: SchemaType.STRING,
                    description: "Title of the news",
                    nullable: false,
                  },
                  short_description: {
                    type: SchemaType.STRING,
                    description:
                      "Short description of the news not exceeding 80 characters",
                    nullable: false,
                  },
                  link: {
                    type: SchemaType.STRING,
                    description: "Link to the news article",
                    nullable: false,
                  },
                  hashtags: {
                    type: SchemaType.ARRAY,
                    items: {
                      type: SchemaType.STRING,
                      description: "Hashtags related to the news",
                      nullable: false,
                    },
                    minItems: 1,
                    maxItems: 3,
                  },
                },
                required: ["title", "link", "hashtags"],
              },
            },
            outro: {
              type: SchemaType.STRING,
              description: "Conclusion of the post",
              nullable: false,
            },
          },
        },
      },
    });

    // const result = await model.generateContent({
    //   contents: [prompt, fileDataPart],
    //   generationConfig: {
    //     responseMimeType: "application/json",
    //     responseSchema: {
    //       type: SchemaType.OBJECT,
    //       properties: {
    //         intro: {
    //           type: SchemaType.STRING,
    //           description: "Introduction to the post",
    //           nullable: false,
    //         },
    //         news_items: {
    //           type: SchemaType.ARRAY,
    //           items: {
    //             type: SchemaType.OBJECT,
    //             properties: {
    //               title: {
    //                 type: SchemaType.STRING,
    //                 description: "Title of the news",
    //                 nullable: false,
    //               },
    //               short_description: {
    //                 type: SchemaType.STRING,
    //                 description:
    //                   "Short description of the news not exceeding 80 characters",
    //                 nullable: false,
    //               },
    //               link: {
    //                 type: SchemaType.STRING,
    //                 description: "Link to the news article",
    //                 nullable: false,
    //               },
    //               hashtags: {
    //                 type: SchemaType.ARRAY,
    //                 items: {
    //                   type: SchemaType.STRING,
    //                   description: "Hashtags related to the news",
    //                   nullable: false,
    //                 },
    //                 minItems: 1,
    //                 maxItems: 3,
    //               },
    //             },
    //             required: ["title", "link", "hashtags"],
    //           },
    //         },
    //         outro: {
    //           type: SchemaType.STRING,
    //           description: "Conclusion of the post",
    //           nullable: false,
    //         },
    //       },
    //     },
    //   },
    // });
    // const response = await result.response;
    const text = response.text;

    console.log("Gemini response received. ============ ", text);
    // Clean the response text to ensure it's valid JSON
    let cleanedText = text.trim();
    // Remove potential markdown code block fences
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.substring(7);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    cleanedText = cleanedText.trim();

    // Attempt to parse the JSON
    let aiNews;
    try {
      aiNews = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Error parsing JSON response from Gemini:", parseError);
      console.error("Raw Gemini response text:", text); // Log raw response for debugging
      throw new Error("Failed to parse structured data from Gemini.");
    }

    // Basic validation
    // if (!Array.isArray(newsItems)) {
    //   throw new Error("Gemini response was not a JSON array.");
    // }
    // if (newsItems.length === 0) {
    //   console.warn("Gemini did not find any AI news items.");
    //   return [];
    // }
    if (!aiNews.intro || !aiNews.outro || !Array.isArray(aiNews.news_items)) {
      throw new Error(
        "Gemini response does not contain the expected structure."
      );
    }
    // Ensure items have the expected structure (optional but good practice)
    aiNews.news_items.forEach((item, index) => {
      if (
        !item.title ||
        !item.link ||
        !item.hashtags ||
        !Array.isArray(item.hashtags)
      ) {
        console.warn(
          `News item at index ${index} has missing or invalid fields:`,
          item
        );
        // You might choose to filter out invalid items here
      }
      // Ensure links are absolute
      if (item.link && item.link.startsWith("/")) {
        item.link = `https://techmeme.com${item.link}`;
      }
    });

    console.log(`Extracted ${aiNews.length} AI news items.`);
    const newsItems = aiNews.news_items;
    newsItems.slice(0, 3);
    aiNews.news_items = newsItems;
    return aiNews;
    // return aiNews.news_items.slice(0, 3); // Ensure we only take max 3
  } catch (error) {
    console.log("Error =============== ", error);
    // console.error('Error interacting with Gemini API:', error.message);
    // if (error.response) { // Log more details if available from Gemini
    //     console.error('Gemini Error Details:', error.response);
    // }
    // throw error;
  }
}

/**
 * Posts news items as a Twitter thread.
 * @param {Array<{title: string, link: string, hashtags: string[]}>} aiNews - Array of news items.
 */
async function postNewsToTwitter(aiNews) {
  if (!aiNews || aiNews.news_items.length === 0) {
    console.log("No news items to post.");
    return;
  }

  console.log(
    `Posting ${aiNews.news_items.length} news items to Twitter as a thread...`
  );

  let previousTweetId = null;

  let tweetText = aiNews.intro;
  tweetText += `\n\n#AI #ArtificialIntelligence #MachineLearning #LLM #GenerativeAI #OpenAI #Anthropic #GoogleAI #MetaAI #Gemini #Techmeme`;
  let postOptions = { text: tweetText };
  const { data: createdTweet } = await twitterUserClient.v2.tweet(postOptions);
  console.log(`Intro tweet posted successfully! ID: ${createdTweet.id}`);
  previousTweetId = createdTweet.id; // Store ID for the next iteration

  let hasError = false;

  for (let i = 0; i < aiNews.news_items.length; i++) {
    const item = aiNews.news_items[i];
    const hashtagString = item.hashtags.join(" ");
    // Construct tweet text - carefully manage length if needed
    let tweetText = `${item.title.replace(/[A-Za-z0-9]/g, translate)}\n\n${item.short_description}\n\n${item.link}\n\n${hashtagString}`;

    // Add thread indicator (optional but good practice)
    if (aiNews.news_items.length > 1) {
      tweetText += `\n\n(${i + 1}/${aiNews.news_items.length})`;
    }

    // Ensure tweet doesn't exceed character limits (basic check)
    if (tweetText.length > 280) {
      console.warn(
        `Tweet ${i + 1} might be too long (${
          tweetText.length
        } chars), attempting to post anyway...`
      );
      // You could implement truncation logic here if necessary
    }

    try {
      console.log(`Posting tweet ${i + 1}: ${item.title}`);
      const postOptions = { text: tweetText };

      // If this is not the first tweet, reply to the previous one to create a thread
      if (previousTweetId) {
        postOptions.reply = { in_reply_to_tweet_id: previousTweetId };
      }

      const { data: createdTweet } = await twitterUserClient.v2.tweet(
        postOptions
      );
      console.log(`Tweet ${i + 1} posted successfully! ID: ${createdTweet.id}`);
      previousTweetId = createdTweet.id; // Store ID for the next iteration

      // Add a small delay between tweets to avoid rate limiting issues (optional but recommended)
      if (i < aiNews.news_items.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // 2-second delay
      }
    } catch (error) {
      hasError = true;
      console.log("Twitter Error =========== ", error);
      console.error(`Error posting tweet ${i + 1}:`, error.message || error);
      if (error.data) {
        // Twitter API often provides details in error.data
        console.error("Twitter API Error Details:", error.data);
      }
      // Decide if you want to stop the thread on error or continue
      // For now, we'll stop.
      console.error("Aborting further posts due to error.");
      break;
    }
  }

  if (!hasError) {
    let tweetText = aiNews.outro;
    tweetText += `\n\n@AI_Techie_Arun`;

    postOptions = { text: tweetText };

    if (previousTweetId) {
      postOptions.reply = { in_reply_to_tweet_id: previousTweetId };
    }

    const { data: createdTweet } = await twitterUserClient.v2.tweet(
      postOptions
    );
    console.log(`Outro tweet posted successfully! ID: ${createdTweet.id}`);
    previousTweetId = createdTweet.id; // Store ID for the next iteration
  }
  console.log("Finished posting thread.");
}

// --- Main Execution Logic ---
async function main() {
  try {
    // 1. Get HTML from Techmeme
    const html = await fetchHtml(TECHMEME_URL);

    uploadedFileMetadata = await uploadHtmlToGemini(
      html,
      `techmeme-latest_${new Date().toISOString()}.html`
    );

    // 2. Extract AI news using Gemini
    const aiNews = await extractAiNewsWithGemini(uploadedFileMetadata);

    console.log("AI News ============= ", aiNews);

    if (aiNews && aiNews.news_items.length > 0) {
      // 3. Post news to Twitter
      await postNewsToTwitter(aiNews);
      console.log("Successfully fetched news and posted to Twitter.");
    } else {
      console.log("No AI news found or extracted. Nothing posted to Twitter.");
    }
  } catch (error) {
    console.error("------------------------------------");
    console.error("An error occurred during execution:");
    console.error(error.message || error);
    console.error("------------------------------------");
    process.exit(1); // Exit with error code
  }
}

// Run the main function
main();
