const {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} = require("@aws-sdk/client-dynamodb");
const { urlAlphabet, customAlphabet } = require("nanoid");

const dynamodb_region = "us-east-1";
const dynamodb_table = "snipps";

addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

const handleRequest = async (request) => {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  } else if (request.method === "GET") {
    return handleFetch(request);
  } else if (request.method == "POST" && url.pathname === "/") {
    return handleCreate(request);
  } else {
    return new Response("Not Found", {
      headers: { "content-type": "text/plain" },
      status: 404,
    });
  }
};

function handleOptions(request) {
  if (
    request.headers.get("Origin") !== null &&
    request.headers.get("Access-Control-Request-Method") !== null &&
    request.headers.get("Access-Control-Request-Headers") !== null
  ) {
    return new Response(null, {
      headers: corsHeaders,
    });
  } else {
    return new Response(null, {
      headers: {
        Allow: "GET, HEAD, POST, PUT, OPTIONS",
      },
    });
  }
}

const handleFetch = async (request) => {
  const url = new URL(request.url);
  const path = url.pathname.slice(1).match("^[a-zA-Z0-9-_]+$");
  if (!path) return fetch(request);
  const key = path[0];
  const value = await get(key);
  if (!value)
    return new Response("Not Found", {
      headers: { "content-type": "text/plain" },
      status: 404,
    });
  return Response.redirect(value, 301);
};

const handleCreate = async (request) => {
  let data = await request.json();
  if (!data.value)
    return new Response(
      JSON.stringify({ error: "Field 'value' is required" }),
      {
        headers: { "content-type": "application/json" },
        status: 400,
      }
    );
  const value = data.value;
  if (!isValidURI(value))
    return new Response(
      JSON.stringify({ error: "Field 'value' is not a valid URI" }),
      {
        headers: { "content-type": "application/json" },
        status: 400,
      }
    );
  if (data.key && !/^[a-zA-Z0-9-_]+$/.test(data.key)) {
    return new Response(
      JSON.stringify({
        error:
          "Invalid characters in field 'key'. Valid characters: A-Z,a-z,0-9,-,_",
      }),
      {
        headers: { "content-type": "application/json" },
        status: 400,
      }
    );
  }
  const key = data.key ? data.key : customAlphabet(urlAlphabet, 12)();
  let ttl = 157680000;
  if (data.ttl && !!parseInt(data.ttl)) ttl = Math.min(parseInt(data.ttl), ttl);
  try {
    await put(key, value, ttl);
    return new Response(JSON.stringify({ key: key, value: value }), {
      headers: { "content-type": "application/json" },
      status: 201,
    });
  } catch (error) {
    if (error.message === "The conditional request failed") {
      return new Response(JSON.stringify({ error: "Key Already Exists" }), {
        headers: { "content-type": "application/json" },
        status: 409,
      });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), {
      headers: { "content-type": "application/json" },
      status: 500,
    });
  }
};

const put = async (key, value, ttl) => {
  const client = new DynamoDBClient({
    region: dynamodb_region,
    credentialDefaultProvider: credentials,
  });
  const record = new PutItemCommand({
    TableName: dynamodb_table,
    Item: {
      key: { S: key },
      value: { S: value },
      ttl: { N: Math.floor(new Date().valueOf() / 1000 + ttl).toString() },
    },
    ConditionExpression: "attribute_not_exists(#k)",
    ExpressionAttributeNames: { "#k": "key" },
  });
  await client.send(record);
};

const get = async (key) => {
  const client = new DynamoDBClient({
    region: dynamodb_region,
    credentialDefaultProvider: credentials,
  });
  const record = new GetItemCommand({
    TableName: dynamodb_table,
    Key: { key: { S: key } },
  });
  const results = await client.send(record);
  if (results.Item) {
    return results.Item["value"]["S"];
  }
  return undefined;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const isValidURI = (value) => {
  try {
    new URL(value);
    return true;
  } catch (err) {
    return false;
  }
};

const credentials = () => {
  return {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  };
};
