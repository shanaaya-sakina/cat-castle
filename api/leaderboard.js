const { createClient } = require("redis");

const KEY = "leaderboard";
const MAX_ENTRIES = 50;
const TOP_N = 5;

let client;

async function getClient() {
  if (!client) {
    client = createClient({ url: process.env.REDIS_URL });
  }
  if (!client.isOpen) {
    await client.connect();
  }
  return client;
}

function topScores(entries) {
  return entries
    .sort((a, b) => a.seconds - b.seconds)
    .slice(0, TOP_N);
}

module.exports = async (req, res) => {
  let redis;
  try {
    redis = await getClient();
  } catch (err) {
    res.status(500).json({ error: "Could not reach leaderboard" });
    return;
  }

  if (req.method === "GET") {
    const raw = await redis.lRange(KEY, 0, -1);
    const entries = raw.map((s) => JSON.parse(s));
    res.status(200).json({ leaderboard: topScores(entries) });
    return;
  }

  if (req.method === "POST") {
    const { name, seconds } = req.body || {};
    const cleanName = typeof name === "string" ? name.trim().slice(0, 16) : "";
    const cleanSeconds = Number(seconds);

    if (!Number.isFinite(cleanSeconds) || cleanSeconds <= 0 || cleanSeconds > 100000) {
      res.status(400).json({ error: "Invalid score" });
      return;
    }

    const entry = { name: cleanName || "Player", seconds: cleanSeconds };
    await redis.rPush(KEY, JSON.stringify(entry));
    await redis.lTrim(KEY, -MAX_ENTRIES, -1);

    const raw = await redis.lRange(KEY, 0, -1);
    const entries = raw.map((s) => JSON.parse(s));
    res.status(200).json({ leaderboard: topScores(entries) });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
};
