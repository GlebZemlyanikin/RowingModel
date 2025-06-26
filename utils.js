// Вспомогательные функции для работы с временем и расчетами

function parseTimeToSeconds(timeStr) {
    try {
        // Handle format MM:SS.ss
        if (timeStr.includes(":")) {
            const [minutes, seconds] = timeStr.split(":").map(Number)
            if (isNaN(minutes) || isNaN(seconds)) {
                return 0
            }
            return minutes * 60 + seconds
        }
        // Handle format MM.SS.ss (minutes.seconds.hundredths)
        if (timeStr.split(".").length === 3) {
            const parts = timeStr.split(".")
            const minutes = parseInt(parts[0])
            const seconds = parseFloat(parts[1] + "." + parts[2])
            if (isNaN(minutes) || isNaN(seconds)) {
                return 0
            }
            return minutes * 60 + seconds
        }
        // Handle format SS.ss - normalize decimal places
        const seconds = parseFloat(timeStr)
        if (isNaN(seconds)) {
            return 0
        }
        return Math.round(seconds * 100) / 100
    } catch (error) {
        return 0
    }
}

function formatTime(seconds) {
    try {
        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = (seconds % 60).toFixed(2)
        return `${minutes}:${remainingSeconds.padStart(5, "0")}`
    } catch (error) {
        return "0:00.00"
    }
}

function avg(arr) {
    try {
        if (!arr || arr.length === 0) return 0
        return arr.reduce((a, b) => a + b, 0) / arr.length
    } catch (error) {
        return 0
    }
}

function calculateModelPercentage(baseModelTime, distance, userTime) {
    if (!baseModelTime || !distance || !userTime) return 0;
    const modelSpeed = 2000 / baseModelTime;
    const userSpeed = distance / userTime;
    return (userSpeed / modelSpeed) * 100;
}

module.exports = {
    parseTimeToSeconds,
    formatTime,
    avg,
    calculateModelPercentage,
}; 