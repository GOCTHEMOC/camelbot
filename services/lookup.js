const axios = require("axios");

async function movieSearch(query) {

  try {
    const url =
`https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`;

    const res = await axios.get(url);

    if (!res.data || !res.data.Search) {
      console.warn("⚠️  No search results for query:", query);
      return [];
    }

    return res.data.Search;
  } catch (err) {
    console.error("❌ Movie Search Error:", err.message);
    throw new Error("Failed to search movies");
  }
}

module.exports = {
  movieSearch
};
