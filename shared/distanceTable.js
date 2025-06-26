const distances = [
    "250м",
    "500м",
    "750м",
    "1000м",
    "1250м",
    "1500м",
    "1750м",
    "2000м",
    "2500м",
]

function getDistance(distanceStr) {
    return parseInt(distanceStr.replace("м", ""))
}

module.exports = { distances, getDistance };
