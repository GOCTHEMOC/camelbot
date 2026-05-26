const axios = require("axios");

async function movieSearch(query) {

  const url =
`https://www.omdbapi.com/?apikey=${process.env.OMDB_API_KEY}&s=${encodeURIComponent(query)}`;

  const res = await axios.get(url);

  return res.data.Search || [];
}

module.exports = {
  movieSearch
};
