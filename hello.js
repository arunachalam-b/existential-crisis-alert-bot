console.log("Hello");

const readTimeoutSecrets = process.env.READ_TIMEOUT_SECRETS;
const readTimeoutVariable = process.env.READ_TIMEOUT_VARIABLE;

console.log("READ_TIMEOUT_SECRETS:", JSON.stringify({hello: ` == ${readTimeoutSecrets} == `}));
console.log("READ_TIMEOUT_VARIABLE:", readTimeoutVariable);
