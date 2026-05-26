const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function askAI(prompt) {

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
}

module.exports = {
  askAI
};
