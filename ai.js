const OpenAI = require('openai');

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function chatAI(message) {
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Camelbot, a concise movie-focused Discord assistant. You discuss films, directors, ratings, and recommendations. Keep responses short and useful."
        },
        {
          role: "user",
          content: message
        }
      ]
    });

    return response.choices[0].message.content;

  } catch (err) {
    console.error(err);
    return "AI error.";
  }
}

module.exports = { chatAI };