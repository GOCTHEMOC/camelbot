const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function askAI(prompt) {

  try {
    const completion =
      await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are Camelbot, a movie-focused Discord assistant."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      });

    return completion.choices[0].message.content;
  } catch (err) {
    console.error("❌ AI Service Error:", err);
    throw new Error("Failed to get AI response");
  }
}

module.exports = {
  askAI
};
