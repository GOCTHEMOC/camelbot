const searches = new Map();

function setSearch(userId, data) {
  searches.set(userId, data);
}

function getSearch(userId) {
  return searches.get(userId);
}

function clearSearch(userId) {
  searches.delete(userId);
}

module.exports = { setSearch, getSearch, clearSearch };
