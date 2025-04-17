console.log("Hello");

const readTimeoutSecrets = process.env.READ_TIMEOUT_SECRETS;
const readTimeoutVariable = process.env.READ_TIMEOUT_VARIABLE;
const secretSplit = readTimeoutSecrets.split("");
for (let i = 0; i < secretSplit.length; i++) {
        console.log("Key ==== ", secretSplit[i]);
}
console.log("READ_TIMEOUT_SECRETS:", JSON.stringify({hello: ` == a${readTimeoutSecrets}a == `}));
console.log("READ_TIMEOUT_VARIABLE:", readTimeoutVariable);
