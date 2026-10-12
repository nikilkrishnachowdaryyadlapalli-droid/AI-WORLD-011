// Netlify serverless function: keeps the AI provider key on the server.
exports.handler = async (event) => {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  };
  const respond = (statusCode, body) => ({
    statusCode,
    headers,
    body: JSON.stringify(body)
  });

  if (event.httpMethod !== "POST") {
    return respond(405, { error: "Use POST for AI requests." });
  }

  // Basic payload and size checks. Add rate limiting before public launch.
  if (!event.body || event.body.length > 12000) {
    return respond(413, { error: "Request is empty or too large." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, { error: "Invalid JSON request." });
  }

  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const mode = payload.mode === "writing" ? "writing" : "chat";
  if (!message || message.length > 4000) {
    return respond(400, { error: "Enter a message under 4,000 characters." });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return respond(503, {
      error: "The AI server is not configured yet. Add OPENAI_API_KEY in Netlify environment variables, then redeploy."
    });
  }

  const system = mode === "writing"
    ? "You are the creative assistant for AI WORLD 011. Help with original scripts, captions, descriptions, story ideas, study explanations, and brainstorming. Be clear and useful. Ask a brief clarifying question only when needed. Do not claim generated content is guaranteed factual."
    : "You are the helpful AI assistant for AI WORLD 011. Answer clearly, respectfully, and concisely. Acknowledge uncertainty when appropriate. Do not ask users for passwords, payment details, or sensitive personal information.";

  try {
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: system,
        input: message,
        max_output_tokens: 700
      })
    });

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      // Avoid returning upstream internals or secret values to the browser.
      console.error("AI provider returned status", upstream.status);
      return respond(502, {
        error: upstream.status === 401
          ? "The server AI key was rejected. Check the key in Netlify."
          : "The AI provider could not complete the request. Check provider billing, model access, and server logs."
      });
    }

    const reply = typeof result.output_text === "string" ? result.output_text.trim() : "";
    if (!reply) return respond(502, { error: "The AI provider returned an empty response. Please try again." });
    return respond(200, { reply });
  } catch (err) {
    console.error("AI request failed:", err && err.message ? err.message : "unknown error");
    return respond(502, { error: "Could not reach the AI provider. Please try again later." });
  }
};
