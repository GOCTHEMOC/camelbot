const axios = require("axios");
const { setSearch } = require("../searchState");

const API_KEY = process.env.OMDB_API_KEY;

async function lookupMovie(query) {
  const res = await axios.get(
    `https://www.omdbapi.com/?apikey=${API_KEY}&s=${encodeURIComponent(query)}`
  );

  if (!res.data.Search) return [];

  return res.data.Search.slice(0, 6);
}

async function getMovie(id) {
  const res = await axios.get(
    `https://www.omdbapi.com/?apikey=${API_KEY}&i=${id}&plot=full`
  );

  return res.data;
}

module.exports = { lookupMovie, getMovie };
