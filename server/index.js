const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();

app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "http://localhost:5173",
        "http://localhost:4173",
        process.env.FRONTEND_URL,
      ].filter(Boolean);

      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
  }),
);

app.use(express.json({ limit: "10mb" }));
app.set("trust proxy", 1);

app.get("/", (_, res) => {
  res.send("MindShift API is running");
});

app.get("/health", (_, res) => res.json({ status: "ok" }));

app.post("/api/chat", async (req, res) => {
  const { messages, systemPrompt } = req.body;

  if (!messages || !systemPrompt) {
    return res.status(400).json({ error: "Missing messages or systemPrompt" });
  }

  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const now = Date.now();

  if (!app.locals.rateLimits) app.locals.rateLimits = new Map();
  const limits = app.locals.rateLimits;
  const userLimit = limits.get(ip) || { count: 0, resetAt: now + 60000 };

  if (now > userLimit.resetAt) {
    userLimit.count = 0;
    userLimit.resetAt = now + 60000;
  }

  userLimit.count++;
  limits.set(ip, userLimit);

  if (userLimit.count > 20) {
    return res
      .status(429)
      .json({ error: "Too many requests — please wait a moment" });
  }

  try {
    const makeRequest = async (retryCount = 0) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      try {
        const response = await fetch(
          "https://api.groq.com/openai/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
            },
            body: JSON.stringify({
              model: "llama-3.1-8b-instant",
              max_tokens: 200,
              temperature: 0.8,
              messages: [
                { role: "system", content: systemPrompt },
                ...messages,
              ],
            }),
            signal: controller.signal,
          },
        );

        clearTimeout(timeout);

        const data = await response.json();

        if (response.status === 429 && retryCount < 2) {
          await new Promise((r) => setTimeout(r, 2000));
          return makeRequest(retryCount + 1);
        }

        if (!response.ok) {
          throw new Error(data.error?.message || "Groq error");
        }

        return data.choices[0].message.content;
      } catch (err) {
        clearTimeout(timeout);

        if (
          (err.name === "AbortError" || err.message.includes("fetch")) &&
          retryCount < 2
        ) {
          await new Promise((r) => setTimeout(r, 1500));
          return makeRequest(retryCount + 1);
        }

        throw err;
      }
    };

    const result = await makeRequest();

    const delay = Math.min(2500, 500 + result.length * 10);
    await new Promise((r) => setTimeout(r, delay));

    return res.json({
      content: result,
      thinking: false,
    });
  } catch (err) {
    console.error("Final Error:", err);

    return res.status(200).json({
      content:
        "hmm... something felt a bit off just now. want to try that again?",
      thinking: false,
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`MindShift server running on port ${PORT}`));
