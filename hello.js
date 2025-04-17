console.log("Hello");

const envs = [
	"GEMINI_API_KEY",
	"TWITTER_API_KEY",
	"TWITTER_API_SECRET",
	"TWITTER_ACCESS_TOKEN",
	"TWITTER_ACCESS_TOKEN_SECRET",
];

for (const env of envs) {
	console.log("Environment Variable: ", env);
	const secret = process.env[env];
	const secretSplit = secret.split("");
	for (let i = 0; i < secretSplit.length; i++) {
		console.log("Key ==== ", secretSplit[i]);
	}
}
