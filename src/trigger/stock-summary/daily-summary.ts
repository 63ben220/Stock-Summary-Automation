import { schedules } from "@trigger.dev/sdk";
import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";

const DISCLAIMER = "Auto-generated summary — not financial advice, just a starting point for your own research.";

async function fetchAlphaVantage(params: Record<string, string>) {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY is not set");

  const url = new URL("https://www.alphavantage.co/query");
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("apikey", apiKey);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage request failed: ${res.status} ${res.statusText}`);
  return res.json();
}

async function synthesizeSummary(movers: unknown, news: unknown) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const anthropic = new Anthropic({ apiKey });
  const message = await anthropic.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1200,
    system:
      "You write a short, easy-to-read daily market email for a personal investor who is not a finance expert. " +
      "Use only the data provided — never invent facts, numbers, or predictions not present in the data. " +
      "This is primarily a GENERAL DAILY MARKET SUMMARY, not a stock-picking list. Structure it as: " +
      "(1) A short 'Market pulse' opening, 3-5 sentences, plain English, summarizing the overall mood/theme of the " +
      "day from the broader news — macro trends, sector themes, what's dominating headlines — not individual movers. " +
      "(2) A brief 'Also happening' section: 2-3 one-line notes on other notable news (earnings, M&A, product " +
      "launches, analyst calls) that don't need to be dramatic price moves, just relevant. " +
      "(3) Only THEN, a small 'Notable movers' section with just 1-2 individual tickers that had an unusually big " +
      "or unusual move today — this should be the shortest part of the email, not the majority of it. For each, " +
      "give the ticker, price move, a plain-English one-line reason, and a one-line TAKEAWAY with your best " +
      "educated, hedged read on where it's headed short-term (e.g. 'likely has more room to run because...' or " +
      "'this looks like it fades because...'), hedged appropriately rather than stated as certainty, and never " +
      "'buy' or 'sell' outright. " +
      "Plain text output suitable for an email body, no markdown formatting, short and scannable overall.",
    messages: [
      {
        role: "user",
        content:
          `Top gainers/losers/most active (Alpha Vantage TOP_GAINERS_LOSERS):\n${JSON.stringify(movers).slice(0, 6000)}\n\n` +
          `Recent financial news with sentiment, multiple topics (Alpha Vantage NEWS_SENTIMENT):\n${JSON.stringify(news).slice(0, 10000)}`,
      },
    ],
  });

  const textBlock = message.content.find((block) => block.type === "text");
  return textBlock && textBlock.type === "text" ? textBlock.text : "";
}

async function sendEmail(subject: string, title: string, body: string) {
  const email = process.env.ICLOUD_EMAIL;
  const password = process.env.ICLOUD_APP_PASSWORD;
  if (!email || !password) throw new Error("ICLOUD_EMAIL / ICLOUD_APP_PASSWORD is not set");

  const transporter = nodemailer.createTransport({
    host: "smtp.mail.me.com",
    port: 587,
    secure: false,
    auth: { user: email, pass: password },
  });

  await transporter.sendMail({
    from: email,
    to: email,
    subject,
    text: `${title}\n${DISCLAIMER}\n\n${body}`,
  });
}

export const dailyStockSummary = schedules.task({
  id: "daily-stock-summary",
  cron: "53 6 * * *",
  timezone: "America/Chicago",
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30_000,
  },
  run: async () => {
    const [movers, news] = await Promise.all([
      fetchAlphaVantage({ function: "TOP_GAINERS_LOSERS" }),
      fetchAlphaVantage({
        function: "NEWS_SENTIMENT",
        topics: "financial_markets,earnings,ipo,mergers_and_acquisitions,technology,economy_macro",
        sort: "LATEST",
        limit: "100",
      }),
    ]);

    const summary = await synthesizeSummary(movers, news);

    const dateLabel = new Date().toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const title = `Daily Market Summary — ${dateLabel}`;
    await sendEmail(title, title, summary);

    return { sent: true, dateLabel };
  },
});
