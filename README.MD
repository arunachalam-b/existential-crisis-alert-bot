# Existential crisis alert bot

This is a Twitter/X bot created to post top AI news everyday in my Twitter/X account. Running the script (`node index.js`) will pull the latest AI news from [https://techmeme.com](https://techmeme.com) website, find the top 3 AI news using Gemini API, post them on my account. You can either clone and run this to create your own AI news bot or you can follow my Twitter/X account [@AI_Techie_Arun](https://x.com/AI_Techie_Arun). 

### Why this name for the project? 
I know this will be your first question. I'm writing this on April 6, 2025. Couple days back, Google Deepmind released a report stating that "AI Technology" may bring existential crisis to humanity. This may be because of it's ability of mis-alignment, mis-behaviour, mistake, etc. So, they urge to think and implement safety measures before think technology could take over humans. 
To make things worse, there are few reports saying Artificial Narrow Intelligence (ANI) has almost been achieved. We'll be able to achieve Artificial General Intelligence (AGI) in a few years, and Artificial Super Intelligence (ASI) in some extended time frame. 
It was at this same time (couple weeks before) I started posting content about AI on Twitter/X. So, I sarcastically came up with this name. 

### Development setup
1. Clone the repo
2. Run `yarn install`
3. Create a copy of `.env.sample` file and name the file as `.env`
4. Update your Gemini API and Twitter/X API credentials there
5. Run `yarn post` to post the latest AI news in your account
