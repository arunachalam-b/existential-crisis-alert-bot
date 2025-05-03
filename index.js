require("dotenv").config();
const axios = require("axios");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { TwitterApi } = require("twitter-api-v2");
const {
  GoogleGenAI,
  createUserContent,
  createPartFromUri,
  Type,
} = require("@google/genai");

const TECHMEME_URL = "https://techmeme.com";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const TWITTER_CONFIG = {
  appKey: process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken: process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
};
const TWEET_LIMIT = 3;
let fileName = "";

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

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const twitterClient = new TwitterApi(TWITTER_CONFIG);
const twitterUserClient = twitterClient.readWrite;

async function fetchHtml(url) {
  console.log(`Fetching HTML from ${url}...`);
  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    });
    if (response.status !== 200) {
      throw new Error(`Failed to fetch HTML: Status code ${response.status}`);
    }
    console.log("HTML fetched successfully.");
    return response.data;
  } catch (error) {
    console.error(`Error fetching HTML from ${url}:`, error.message);
    throw error;
  }
}

async function uploadHtmlToGemini(htmlContent, filename = "techmeme.html") {
  console.log(`Uploading ${filename} to Gemini File API...`);
  const tempFilePath = path.join(os.tmpdir(), filename);

  try {
    await fs.writeFile(tempFilePath, htmlContent);
    console.log(`HTML saved temporarily to ${tempFilePath}`);

    const uploadResult = await ai.files.upload({
      file: tempFilePath,
      config: {
        mimeType: "	text/html",
        displayName: filename,
      },
    });

    fileName = uploadResult.name;

    console.log(
      `File uploaded successfully. File Name: ${fileName}, URI: ${uploadResult.uri}`
    );

    await fs.unlink(tempFilePath);
    console.log(`Temporary file ${tempFilePath} deleted.`);

    return uploadResult;
  } catch (error) {
    console.error("Error during file upload to Gemini:", error);
    try {
      await fs.access(tempFilePath);
      await fs.unlink(tempFilePath);
      console.log(`Temporary file ${tempFilePath} cleaned up after error.`);
    } catch (cleanupError) {
      console.warn(
        `Could not cleanup temporary file ${tempFilePath}: ${cleanupError.message}`
      );
    }
    throw new Error(
      `Failed to upload file to Gemini File API: ${error.message}`
    );
  }
}

async function extractAiNewsWithGemini(uploadedFile) {
  console.log("Sending HTML to Gemini for AI news extraction...");
  try {
    const prompt = `
            Analyze the content of the provided HTML file (${uploadedFile.displayName}), which contains the Techmeme homepage. Identify the top ${TWEET_LIMIT} news headlines specifically related to Artificial Intelligence (AI), Machine Learning (ML), Large Language Models (LLMs), Generative AI, or significant AI company news (like OpenAI, Anthropic, Google AI, Meta AI, etc.).

            For each of the top ${TWEET_LIMIT} AI news items, provide:
            1. The main headline text (title) not exceeding 60 characters.
            2. A short description (not exceeding 150 characters) summarizing the news.
            3. The direct URL (link) associated with that headline on Techmeme. Link to the news article source. 
            4. A list of 1-3 relevant hashtags (e.g., #Google, #Gemini, #LLM, #Llama, #Funding, #Research, #OpenAI, #ChatGPT, #Claude, #Sonnet, #Microsoft, #Techcrunch, #Bloomberg). Don't include #AI or #ArtificialIntelligence hashtags. If possible, include one hashtag of the publisher. 

            Return the result ONLY as a JSON array of objects, where each object has the keys "title", "short_description", "link", and "hashtags" (which is an array of strings). Do not include any explanations around the JSON. However, you may include emojis. 

            Also, give me a short content before these lines to start with (an intro hook) and give me a short content asking the user to follow to receive more content at the end (outro hook). 

            Here's an example: 
            Intro:
            From big price tags to free college perks, the AI world isn’t slowing down. Here are today’s top 3 stories you should know:

            Top ${TWEET_LIMIT} AI News:

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

    const response = await ai.models.generateContent({
      model: "models/gemini-2.5-pro-exp-03-25",
      contents: [
        createUserContent([
          prompt,
          createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
        ]),
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intro: {
              type: Type.STRING,
              description: "Introduction to the post",
              nullable: false,
            },
            news_items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description:
                      "Title of the news not exceeding 60 characters",
                    nullable: false,
                  },
                  short_description: {
                    type: Type.STRING,
                    description:
                      "Short description of the news not exceeding 150 characters",
                    nullable: false,
                  },
                  link: {
                    type: Type.STRING,
                    description: "Link to the news article",
                    nullable: false,
                  },
                  hashtags: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.STRING,
                      description:
                        "Hashtags related to the news. Don't include #AI or #ArtificialIntelligence hashtags",
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
              type: Type.STRING,
              description: "Conclusion of the post",
              nullable: false,
            },
          },
        },
      },
    });

    const text = response.text;

    console.log("Gemini response received", text);

    let cleanedText = text.trim();
    if (cleanedText.startsWith("```json")) {
      cleanedText = cleanedText.substring(7);
    }
    if (cleanedText.endsWith("```")) {
      cleanedText = cleanedText.substring(0, cleanedText.length - 3);
    }
    cleanedText = cleanedText.trim();

    let aiNews;
    try {
      aiNews = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error("Error parsing JSON response from Gemini:", parseError);
      console.error("Raw Gemini response text:", text);
      throw new Error("Failed to parse structured data from Gemini.");
    }

    if (!aiNews.intro || !aiNews.outro || !Array.isArray(aiNews.news_items)) {
      throw new Error(
        "Gemini response does not contain the expected structure."
      );
    }

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
      }
      if (item.link && item.link.startsWith("/")) {
        item.link = `https://techmeme.com${item.link}`;
      }
      const hashTags = item.hashtags?.map((hashtag) => {
        if (hashtag.startsWith("#")) {
          return hashtag;
        }
        return `#${hashtag}`;
      }) || [];
      item.hashtags = hashTags;
    });

    console.log(`Extracted ${aiNews.length} AI news items.`);
    let newsItems = aiNews.news_items;
    newsItems = newsItems.slice(0, TWEET_LIMIT);
    aiNews.news_items = newsItems;
    return aiNews;
  } catch (error) {
    console.error("Error interacting with Gemini API:", error.message);
    if (error.response) {
      console.error("Gemini Error Details:", error.response);
    }
    throw error;
  }
}

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
  previousTweetId = createdTweet.id;

  await new Promise((resolve) => setTimeout(resolve, 5000));

  let hasError = false;

  for (let i = 0; i < aiNews.news_items.length; i++) {
    const item = aiNews.news_items[i];
    const hashtagString = item.hashtags.join(" ");
    let tweetText = `${item.title}\n\n${item.short_description}\n\n${hashtagString}`;

    if (aiNews.news_items.length > 1) {
      // tweetText += `\n\n(${i + 1}/${aiNews.news_items.length})`;
    }

    if (tweetText.length > 280) {
      console.warn(
        `Tweet ${i + 1} might be too long (${
          tweetText.length
        } chars), attempting to post anyway...`
      );
    }

    try {
      console.log(`Posting tweet ${i + 1}: ${item.title}`);
      const postOptions = { text: tweetText };

      if (previousTweetId) {
        postOptions.reply = { in_reply_to_tweet_id: previousTweetId };
      }

      const { data: createdTweet } = await twitterUserClient.v2.tweet(
        postOptions
      );
      console.log(`Tweet ${i + 1} posted successfully! ID: ${createdTweet.id}`);
      previousTweetId = createdTweet.id;

      if (i < aiNews.news_items.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    } catch (error) {
      hasError = true;
      console.error(`Error posting tweet ${i + 1}:`, error.message || error);
      if (error.data) {
        console.error("Twitter API Error Details:", error.data);
      }

      // if (i === 0) {
      //   console.error("Aborting further posts due to error.");
      //   break;
      // }
    }
  }

  if (!hasError) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    let tweetText = aiNews.outro;

    postOptions = { text: tweetText };

    if (previousTweetId) {
      postOptions.reply = { in_reply_to_tweet_id: previousTweetId };
    }

    const { data: createdTweet } = await twitterUserClient.v2.tweet(
      postOptions
    );
    console.log(`Outro tweet posted successfully! ID: ${createdTweet.id}`);
    previousTweetId = createdTweet.id;
  }
  console.log("Finished posting thread.");
}

async function deleteFile(fileName) {
  if (fileName === "") {
    console.log("File not uploaded. Skipping deletion.");
    return;
  }

  try {
    console.log(`Deleting file ${fileName}...`);
    await ai.files.delete({
      name: fileName,
    });
    console.log(`File ${fileName} deleted successfully.`);
  } catch (error) {
    console.error("Error deleting file:", error.message);
  }
}

async function deleteAllFiles() {
  const pager = await ai.files.list({ config: { pageSize: 10 } });
  let page = pager.page;
  while (true) {
    for (const file of page) {
      console.log("Deleting - ", file.name);
      await ai.files.delete({
        name: file.name,
      });
    }
    if (!pager.hasNextPage()) {
      break;
    }
    page = await pager.nextPage();
  }

  console.log("Deleted Files:", count);
}

async function main() {
  try {
    const html = await fetchHtml(TECHMEME_URL);

    uploadedFileMetadata = await uploadHtmlToGemini(
      html,
      `techmeme-latest_${new Date().toISOString()}.html`
    );

    const aiNews = await extractAiNewsWithGemini(uploadedFileMetadata);

    if (aiNews && aiNews.news_items.length > 0) {
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
    process.exit(1);
  } finally {
    await deleteFile(fileName);
  }
}

main();
// deleteAllFiles();
