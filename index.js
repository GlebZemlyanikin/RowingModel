require("dotenv").config()
const TelegramBot = require("node-telegram-bot-api")
const express = require("express")
const { getModelTime } = require("./modelTableWORLD")
const { getModelTime: getModelTimeRU } = require("./modelTableRUSSIA")
const { distances, getDistance } = require("./distanceTable")
const winston = require("winston")
const fs = require("fs")
const ExcelJS = require("exceljs")
const path = require("path")

console.log("Starting bot initialization...")

// Configure logger first
const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: "error.log", level: "error" }),
        new winston.transports.File({ filename: "combined.log" }),
        new winston.transports.Console({
            format: winston.format.simple(),
        }),
    ],
})

logger.info("Logger configured")

// Create Express app
const app = express()
const port = process.env.PORT || 3000

// Basic route for health check
app.get("/", (req, res) => {
    logger.info("Health check endpoint called")
    res.send("Bot is running!")
})

// Start web server
app.listen(port, () => {
    logger.info(`Web server is running on port ${port}`)
})

// User sessions storage
const userSessions = new Map()
logger.info("User sessions storage initialized")

// Create a bot instance
if (!process.env.TELEGRAM_BOT_TOKEN) {
    logger.error("TELEGRAM_BOT_TOKEN is not set!")
    process.exit(1)
}

logger.info("Creating bot instance...")
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: {
        interval: 300,
        autoStart: true,
        params: {
            timeout: 10,
        },
    },
})

// Error handling for polling
bot.on("polling_error", (error) => {
    if (error.code === "ETELEGRAM" && error.response.statusCode === 409) {
        logger.warn("Polling conflict detected. Restarting polling...")
        setTimeout(() => {
            bot.stopPolling()
            setTimeout(() => {
                bot.startPolling()
            }, 1000)
        }, 1000)
    } else {
        logger.error("Polling error:", error)
    }
})

logger.info("Bot instance created")

// User states storage
const userStates = new Map()
logger.info("User states storage initialized")

// Create necessary directories
const dirs = ["sessions", "backups"]
dirs.forEach((dir) => {
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true })
            logger.info(`Created directory: ${dir}`)
        } catch (error) {
            logger.error(`Error creating directory ${dir}: ${error.message}`)
        }
    }
})

// Age categories for different models
const worldAgeCategories = [
    "Юноши до 19",
    "Девушки до 19",
    "Юниоры до 23",
    "Юниорки до 23",
    "Мужчина",
    "Женщины",
]

const russiaAgeCategories = [
    "Юноши до 15",
    "Девушки до 15",
    "Юноши до 17",
    "Девушки до 17",
    "Юноши до 19",
    "Девушки до 19",
    "Юниоры до 23",
    "Юниорки до 23",
    "Мужчина",
    "Женщины",
]

// Boat classes
const boatClasses = [
    "1х",
    "1х л/в",
    "2-",
    "2- л/в",
    "2х",
    "2х л/в",
    "4-",
    "4х",
    "4х л/в",
    "4+",
    "8+",
]

// Conversation states
const STATES = {
    IDLE: "IDLE",
    WAITING_MODEL_TYPE: "WAITING_MODEL_TYPE",
    WAITING_MODE: "WAITING_MODE",
    WAITING_NAME: "WAITING_NAME",
    WAITING_AGE: "WAITING_AGE",
    WAITING_DISTANCE: "WAITING_DISTANCE",
    WAITING_BOAT: "WAITING_BOAT",
    WAITING_TIME: "WAITING_TIME",
    WAITING_NEXT_ACTION: "WAITING_NEXT_ACTION",
    EDITING_LAST_TIME: "EDITING_LAST_TIME",
    VIEWING_HISTORY: "VIEWING_HISTORY",
}

// Cache configuration
const cache = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes in milliseconds

// Language settings
const languages = {
    ru: {
        selectModel: "Выберите тип модели:",
        selectMode: "Выберите режим работы:",
        enterName: "Введите имя или фамилию:",
        selectAge: "Выберите возрастную категорию:",
        selectDistance: "Выберите дистанцию",
        selectBoat: "Выберите класс лодки",
        enterTime:
            "Введите время в формате СС.сс или ММ:СС.сс (например, 45.55 или 7:45.55)",
        cancel: "Отмена",
        settings: "Настройки:",
        changeLanguage: "Изменить язык",
        selectLanguage: "Выберите язык:",
        languageChanged: "Язык изменен",
        back: "Назад",
        invalidModel:
            "Пожалуйста, выберите тип модели из предложенных вариантов",
        invalidMode: "Пожалуйста, выберите режим из предложенных вариантов",
        invalidAge: "Пожалуйста, выберите категорию из предложенных вариантов",
        invalidDistance:
            "Пожалуйста, выберите дистанцию из предложенных вариантов",
        invalidBoat:
            "Пожалуйста, выберите класс лодки из предложенных вариантов",
        invalidTime:
            "Пожалуйста, введите время в формате СС.сс или ММ:СС.сс (например, 45.55 или 7:45.55). Также можно использовать формат ММ.СС.сс (например, 7.45.55).",
        invalidSeconds:
            "Пожалуйста, введите время в формате СС.сс или ММ:СС.сс (например, 45.5 или 7:45.5). Секунды не могут быть больше 59.",
        calculationError:
            "Произошла ошибка при расчете модельного времени. Пожалуйста, попробуйте снова.",
        useStart: "Используйте /start для нового расчета",
        selectAction: "Выберите действие:",
        enterMoreTime: "Ввести еще время",
        newName: "Новое имя",
        finishAndGetExcel: "Завершить и получить Excel",
        editLastTime: "Редактировать последнее время",
        viewHistory: "Просмотреть историю",
        noResults: "Нет результатов для редактирования",
        historyEmpty: "История пуста",
        timeUpdated: "Время успешно обновлено",
        invalidAction:
            "Пожалуйста, выберите действие из предложенных вариантов",
        excelError:
            "Произошла ошибка при создании Excel файла. Пожалуйста, попробуйте снова.",
        noDataForExcel:
            "Нет данных для создания Excel файла. Используйте /start для начала.",
        worldModel: "Мировая модель",
        russiaModel: "Российская модель (Н.Н.)",
        singleTime: "Ввести одно время",
        createFile: "Создать файл с результатами",
        mainMenu: "Главное меню",
        modelError: "Ошибка при расчете модели. Пожалуйста, попробуйте снова.",
        timeResult: "ваше время: {time}\nваша модель: {percentage}%",
    },
}

// User settings storage
const userSettings = new Map()

// Initialize user settings
function initUserSettings(chatId) {
    userSettings.set(chatId, {
        language: "ru", // default language
    })
}

// Get user settings
function getUserSettings(chatId) {
    if (!userSettings.has(chatId)) {
        initUserSettings(chatId)
    }
    return userSettings.get(chatId)
}

// Get translated message
function getMessage(chatId, key) {
    return languages.ru[key] || key
}

// Cache functions
function setCache(key, value) {
    cache.set(key, {
        value,
        timestamp: Date.now(),
    })
}

function getCache(key) {
    const cached = cache.get(key)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.value
    }
    return null
}

// Initialize user state
function initUserState(chatId) {
    userStates.set(chatId, {
        state: STATES.WAITING_MODEL_TYPE,
        modelType: null,
        mode: null,
        name: null,
        ageCategory: null,
        distance: null,
        boatClass: null,
        time: null,
    })
}

// Initialize user session
function initUserSession(chatId, username) {
    userSessions.set(chatId, {
        username,
        chatId,
        startTime: new Date().toISOString(),
        actions: [],
        results: [],
    })
}

// Log user action
function logUserAction(chatId, action, details = {}) {
    const session = userSessions.get(chatId)
    if (session) {
        session.actions.push({
            timestamp: new Date().toISOString(),
            action,
            ...details,
        })
    }
}

// Save session to file
function saveSession(chatId) {
    const session = userSessions.get(chatId)
    if (session) {
        const filename = `sessions/${session.username}_${
            session.chatId
        }_${session.startTime.replace(/[:.]/g, "-")}.json`
        fs.writeFileSync(filename, JSON.stringify(session, null, 2))
    }
}

// Create Excel file
async function createExcelFile(chatId) {
    try {
        const cacheKey = `excel_${chatId}`
        const cachedResult = getCache(cacheKey)
        if (cachedResult) {
            logger.info(`Using cached Excel file for chatId ${chatId}`)
            return cachedResult
        }

        const session = userSessions.get(chatId)
        if (!session || !session.results.length) {
            logger.warn(`No results found for chatId ${chatId}`)
            return null
        }

        logger.info(
            `Creating Excel file for ${session.username} with ${session.results.length} results`
        )

        const workbook = new ExcelJS.Workbook()
        logger.info("Created new workbook")

        // Main results worksheet
        const worksheet = workbook.addWorksheet("Результаты")
        logger.info("Added main worksheet")

        // Statistics worksheet
        const statsWorksheet = workbook.addWorksheet("Статистика")
        logger.info("Added statistics worksheet")

        // Group results by name
        const groupedResults = {}
        session.results.forEach((result) => {
            if (!groupedResults[result.name]) {
                groupedResults[result.name] = {
                    name: result.name,
                    distance: result.distance,
                    boatClass: result.boatClass,
                    ageCategory: result.ageCategory,
                    times: [],
                    models: [],
                }
            }
            groupedResults[result.name].times.push(result.time)
            groupedResults[result.name].models.push(
                parseFloat(result.modelPercentage)
            )
        })
        logger.info(
            `Grouped results for ${Object.keys(groupedResults).length} athletes`
        )

        // Add headers to main worksheet
        const headers = ["Имя", "Дистанция", "Класс", "Возраст"]
        const maxResults = Math.max(
            ...Object.values(groupedResults).map((g) => g.times.length)
        )

        for (let i = 0; i < maxResults; i++) {
            headers.push(`Время ${i + 1}`, `Модель ${i + 1}`)
        }
        headers.push("Среднее время", "Средняя модель")

        worksheet.addRow(headers)
        logger.info("Added headers to main worksheet")

        // Style header row
        worksheet.getRow(1).font = { bold: true }

        // Add data rows
        Object.values(groupedResults).forEach((group) => {
            const rowData = [
                group.name,
                group.distance,
                group.boatClass,
                group.ageCategory,
            ]

            // Add times and models
            for (let i = 0; i < maxResults; i++) {
                if (i < group.times.length) {
                    rowData.push(group.times[i], `${group.models[i]}%`)
                } else {
                    rowData.push("", "")
                }
            }

            // Calculate statistics for this athlete
            const times = group.times.map((t) => {
                const seconds = parseTimeToSeconds(t)
                logger.info(`Parsed time ${t} to ${seconds} seconds`)
                return seconds
            })
            const models = group.models

            // Calculate average time
            const avgSeconds = avg(times)
            const avgTime = formatTime(avgSeconds)
            const avgModel = avg(models).toFixed(2)

            logger.info(
                `Calculated averages for ${group.name}: time=${avgTime} (${avgSeconds}s), model=${avgModel}%`
            )

            rowData.push(avgTime, `${avgModel}%`)

            worksheet.addRow(rowData)
        })
        logger.info("Added data rows to main worksheet")

        // Add statistics to stats worksheet
        statsWorksheet.addRow(["Общая статистика"])
        statsWorksheet.addRow([
            "Количество спортсменов",
            Object.keys(groupedResults).length,
        ])
        statsWorksheet.addRow([
            "Общее количество результатов",
            session.results.length,
        ])

        // Calculate team statistics
        const allModels = session.results.map((r) =>
            parseFloat(r.modelPercentage)
        )
        const teamAvgModel = avg(allModels).toFixed(2)

        statsWorksheet.addRow([
            "Средний процент от модели по команде",
            `${teamAvgModel}%`,
        ])
        logger.info("Added statistics to stats worksheet")

        // Set column widths
        worksheet.columns.forEach((column) => {
            column.width = 15
        })
        statsWorksheet.columns.forEach((column) => {
            column.width = 30
        })

        // Save Excel file with absolute path
        const filename = `results_${session.username}_${session.chatId}.xlsx`
        const filePath = path.resolve(filename)
        logger.info(`Attempting to save Excel file to: ${filePath}`)

        await workbook.xlsx.writeFile(filePath)
        logger.info(`Excel file created successfully: ${filePath}`)

        const result = { excelFile: filePath }
        setCache(cacheKey, result)
        return result
    } catch (error) {
        logger.error(`Error creating Excel file: ${error.message}`, error)
        logger.error(`Error stack: ${error.stack}`)
        throw error
    }
}

// Helper function to parse time string to seconds
function parseTimeToSeconds(timeStr) {
    try {
        // Handle format MM:SS.ss
        if (timeStr.includes(":")) {
            const [minutes, seconds] = timeStr.split(":").map(Number)
            if (isNaN(minutes) || isNaN(seconds)) {
                logger.error(`Invalid time format: ${timeStr}`)
                return 0
            }
            return minutes * 60 + seconds
        }

        // Handle format SS.ss
        const seconds = parseFloat(timeStr)
        if (isNaN(seconds)) {
            logger.error(`Invalid time format: ${timeStr}`)
            return 0
        }
        return seconds
    } catch (error) {
        logger.error(`Error parsing time: ${timeStr}`, error)
        return 0
    }
}

// Helper function to format seconds to time string
function formatTime(seconds) {
    try {
        const minutes = Math.floor(seconds / 60)
        const remainingSeconds = (seconds % 60).toFixed(2)
        return `${minutes}:${remainingSeconds.padStart(5, "0")}`
    } catch (error) {
        logger.error(`Error formatting time: ${seconds}`, error)
        return "0:00.00"
    }
}

// Helper function to calculate average
function avg(arr) {
    try {
        if (!arr || arr.length === 0) {
            logger.warn("Empty array for average calculation")
            return 0
        }
        return arr.reduce((a, b) => a + b, 0) / arr.length
    } catch (error) {
        logger.error(`Error calculating average: ${arr}`, error)
        return 0
    }
}

// Backup configuration
const BACKUP_DIR = "backups"
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

// Backup functions
async function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
        const backupData = {
            timestamp,
            userSessions: Array.from(userSessions.entries()),
            userStates: Array.from(userStates.entries()),
            userSettings: Array.from(userSettings.entries()),
        }

        const backupFile = `${BACKUP_DIR}/backup_${timestamp}.json`
        await fs.promises.writeFile(
            backupFile,
            JSON.stringify(backupData, null, 2)
        )
        logger.info(`Backup created: ${backupFile}`)

        // Clean up old backups (keep last 7 days)
        const files = await fs.promises.readdir(BACKUP_DIR)
        const oldFiles = files.filter((file) => {
            const filePath = `${BACKUP_DIR}/${file}`
            const stats = fs.statSync(filePath)
            const fileAge = Date.now() - stats.mtime.getTime()
            return fileAge > 7 * 24 * 60 * 60 * 1000 // 7 days
        })

        for (const file of oldFiles) {
            await fs.promises.unlink(`${BACKUP_DIR}/${file}`)
            logger.info(`Old backup deleted: ${file}`)
        }
    } catch (error) {
        logger.error(`Error creating backup: ${error.message}`, error)
    }
}

async function restoreFromBackup(backupFile) {
    try {
        const backupData = JSON.parse(
            await fs.promises.readFile(backupFile, "utf8")
        )

        // Clear current data
        userSessions.clear()
        userStates.clear()
        userSettings.clear()

        // Restore data
        backupData.userSessions.forEach(([key, value]) =>
            userSessions.set(key, value)
        )
        backupData.userStates.forEach(([key, value]) =>
            userStates.set(key, value)
        )
        backupData.userSettings.forEach(([key, value]) =>
            userSettings.set(key, value)
        )

        logger.info(`Data restored from backup: ${backupFile}`)
        return true
    } catch (error) {
        logger.error(`Error restoring from backup: ${error.message}`, error)
        return false
    }
}

// Schedule regular backups
setInterval(createBackup, BACKUP_INTERVAL)

// Add backup command
bot.onText(/\/backup/, async (msg) => {
    const chatId = msg.chat.id
    try {
        await createBackup()
        bot.sendMessage(chatId, "Резервная копия данных создана")
    } catch (error) {
        logger.error(`Error in backup command: ${error.message}`, error)
        bot.sendMessage(chatId, "Ошибка при создании резервной копии")
    }
})

// Add restore command
bot.onText(/\/restore/, async (msg) => {
    const chatId = msg.chat.id
    try {
        const files = await fs.promises.readdir(BACKUP_DIR)
        if (files.length === 0) {
            bot.sendMessage(chatId, "Нет доступных резервных копий")
            return
        }

        // Sort backups by date (newest first)
        const sortedFiles = files.sort().reverse()
        const latestBackup = sortedFiles[0]

        const success = await restoreFromBackup(`${BACKUP_DIR}/${latestBackup}`)
        if (success) {
            bot.sendMessage(
                chatId,
                "Данные восстановлены из последней резервной копии"
            )
        } else {
            bot.sendMessage(chatId, "Ошибка при восстановлении данных")
        }
    } catch (error) {
        logger.error(`Error in restore command: ${error.message}`, error)
        bot.sendMessage(chatId, "Ошибка при восстановлении данных")
    }
})

// Start command handler
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id
    const username = msg.from.username || msg.from.first_name
    logger.info(`User ${username} (${chatId}) started the bot`)

    initUserState(chatId)
    initUserSession(chatId, username)
    initUserSettings(chatId)
    logUserAction(chatId, "start_bot")

    const keyboard = {
        reply_markup: {
            keyboard: [
                [getMessage(chatId, "worldModel")],
                [getMessage(chatId, "russiaModel")],
            ],
            one_time_keyboard: true,
        },
    }

    bot.sendMessage(chatId, getMessage(chatId, "selectModel"), keyboard)
})

// Add cancel button to keyboard
function addCancelButton(keyboard) {
    keyboard.reply_markup.keyboard.push(["Отмена"])
    return keyboard
}

// Handle cancel action
function handleCancel(chatId) {
    const userState = userStates.get(chatId)
    if (userState) {
        if (userState.state === STATES.WAITING_NEXT_ACTION) {
            // If in next action state, go back to time input
            userState.state = STATES.WAITING_TIME
            bot.sendMessage(
                chatId,
                "Введите время в формате СС.сс или ММ:СС.сс (например, 45.55 или 7:45.55)"
            )
        } else {
            // For other states, reset to start
            initUserState(chatId)
            const keyboard = {
                reply_markup: {
                    keyboard: [
                        [getMessage(chatId, "worldModel")],
                        [getMessage(chatId, "russiaModel")],
                    ],
                    one_time_keyboard: true,
                },
            }
            bot.sendMessage(chatId, "Выберите тип модели:", keyboard)
        }
    }
}

// Add settings command
bot.onText(/\/settings/, (msg) => {
    const chatId = msg.chat.id
    const keyboard = {
        reply_markup: {
            keyboard: [[getMessage(chatId, "back")]],
            one_time_keyboard: true,
        },
    }
    bot.sendMessage(chatId, getMessage(chatId, "settings"), keyboard)
})

// Update keyboard generation to use translated text
function getTranslatedKeyboard(chatId, items) {
    return {
        reply_markup: {
            keyboard: items.map((item) => [getMessage(chatId, item)]),
            one_time_keyboard: true,
        },
    }
}

// Message handler
bot.on("message", async (msg) => {
    const chatId = msg.chat.id
    const text = msg.text
    const username = msg.from.username || msg.from.first_name

    if (text === "Отмена") {
        handleCancel(chatId)
        return
    }

    logger.info(`User ${username} (${chatId}) sent message: ${text}`)

    if (!userStates.has(chatId)) {
        initUserState(chatId)
    }

    const userState = userStates.get(chatId)

    switch (userState.state) {
        case STATES.WAITING_MODEL_TYPE:
            if (
                text === getMessage(chatId, "worldModel") ||
                text === getMessage(chatId, "russiaModel")
            ) {
                userState.modelType = text
                userState.state = STATES.WAITING_MODE
                logger.info(`User ${username} selected model type: ${text}`)
                logUserAction(chatId, "select_model_type", { modelType: text })

                const keyboard = {
                    reply_markup: {
                        keyboard: [
                            [getMessage(chatId, "singleTime")],
                            [getMessage(chatId, "createFile")],
                        ],
                        one_time_keyboard: true,
                    },
                }
                addCancelButton(keyboard)
                bot.sendMessage(
                    chatId,
                    getMessage(chatId, "selectMode"),
                    keyboard
                )
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "invalidModel"))
            }
            break

        case STATES.WAITING_MODE:
            if (
                text === getMessage(chatId, "singleTime") ||
                text === getMessage(chatId, "createFile")
            ) {
                userState.mode = text
                if (text === getMessage(chatId, "createFile")) {
                    userState.state = STATES.WAITING_NAME
                    logger.info(`User ${username} selected mode: ${text}`)
                    logUserAction(chatId, "select_mode", { mode: text })
                    bot.sendMessage(chatId, getMessage(chatId, "enterName"))
                } else {
                    userState.state = STATES.WAITING_AGE
                    logger.info(`User ${username} selected mode: ${text}`)
                    logUserAction(chatId, "select_mode", { mode: text })

                    // Use translated keyboard for age categories
                    const availableAgeCategories =
                        userState.modelType === getMessage(chatId, "worldModel")
                            ? worldAgeCategories
                            : russiaAgeCategories
                    const keyboard = getTranslatedKeyboard(
                        chatId,
                        availableAgeCategories
                    )
                    bot.sendMessage(
                        chatId,
                        getMessage(chatId, "selectAge"),
                        keyboard
                    )
                }
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "invalidMode"))
            }
            break

        case STATES.WAITING_NAME:
            userState.name = text
            userState.state = STATES.WAITING_AGE
            logger.info(`User ${username} entered name: ${text}`)
            logUserAction(chatId, "enter_name", { name: text })

            // Use translated keyboard for age categories
            const availableAgeCategories =
                userState.modelType === getMessage(chatId, "worldModel")
                    ? worldAgeCategories
                    : russiaAgeCategories
            const keyboard = getTranslatedKeyboard(
                chatId,
                availableAgeCategories
            )
            bot.sendMessage(chatId, getMessage(chatId, "selectAge"), keyboard)
            break

        case STATES.WAITING_AGE:
            // Check if the text matches any translated age category
            const ageCategories =
                userState.modelType === getMessage(chatId, "worldModel")
                    ? worldAgeCategories
                    : russiaAgeCategories

            const selectedCategory = ageCategories.find(
                (cat) => getMessage(chatId, cat) === text
            )

            if (selectedCategory) {
                // Store original (untranslated) value
                userState.ageCategory = selectedCategory
                userState.state = STATES.WAITING_DISTANCE
                logger.info(
                    `User ${username} selected age category: ${selectedCategory}`
                )
                logUserAction(chatId, "select_age_category", {
                    category: selectedCategory,
                })

                const keyboard = getTranslatedKeyboard(chatId, distances)
                bot.sendMessage(
                    chatId,
                    getMessage(chatId, "selectDistance"),
                    keyboard
                )
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "invalidAge"))
            }
            break

        case STATES.WAITING_DISTANCE:
            // Check if the text matches any translated distance
            const selectedDistance = distances.find(
                (dist) => getMessage(chatId, dist) === text
            )

            if (selectedDistance) {
                // Store original (untranslated) value
                userState.distance = getDistance(selectedDistance)
                userState.state = STATES.WAITING_BOAT
                logger.info(
                    `User ${username} selected distance: ${selectedDistance}`
                )
                logUserAction(chatId, "select_distance", {
                    distance: selectedDistance,
                })

                const keyboard = getTranslatedKeyboard(chatId, boatClasses)
                bot.sendMessage(
                    chatId,
                    getMessage(chatId, "selectBoat"),
                    keyboard
                )
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "invalidDistance"))
            }
            break

        case STATES.WAITING_BOAT:
            // Check if the text matches any translated boat class
            const selectedBoat = boatClasses.find(
                (boat) => getMessage(chatId, boat) === text
            )

            if (selectedBoat) {
                // Store original (untranslated) value
                userState.boatClass = selectedBoat
                userState.state = STATES.WAITING_TIME
                logger.info(
                    `User ${username} selected boat class: ${selectedBoat}`
                )
                logUserAction(chatId, "select_boat", { boat: selectedBoat })

                bot.sendMessage(chatId, getMessage(chatId, "enterTime"))
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "invalidBoat"))
            }
            break

        case STATES.WAITING_TIME:
            logger.info(`Processing time input: ${text}`)

            // Normalize time format (replace first dot with colon for MM.SS.ss format)
            let normalizedTime = text
            if (text.match(/^\d{1,2}\.\d{1,2}\.\d{1,2}$/)) {
                normalizedTime = text.replace(
                    /^(\d{1,2})\.(\d{1,2})\.(\d{1,2})$/,
                    "$1:$2.$3"
                )
            }
            logger.info(`Normalized time: ${normalizedTime}`)

            // Check both MM:SS.ss and SS.ss formats
            const timeMatch = normalizedTime.match(
                /^(?:(\d{1,2}):)?(\d{1,2})(?:\.(\d{1,2}))?$/
            )
            logger.info(`Time match result:`, timeMatch)

            if (timeMatch) {
                const [, minutes, seconds, hundredths] = timeMatch
                const totalSeconds =
                    (minutes ? parseInt(minutes) * 60 : 0) +
                    parseInt(seconds) +
                    (hundredths ? parseInt(hundredths) / 100 : 0)

                logger.info(`Parsed time components:`, {
                    minutes,
                    seconds,
                    hundredths,
                    totalSeconds,
                })

                if (parseInt(seconds) > 59) {
                    bot.sendMessage(
                        chatId,
                        getMessage(chatId, "invalidSeconds")
                    )
                    return
                }

                userState.time = totalSeconds
                logger.info(
                    `User ${username} entered time: ${text} (${totalSeconds} seconds)`
                )
                logUserAction(chatId, "enter_time", {
                    time: text,
                    seconds: totalSeconds,
                })

                try {
                    // Log the values being used for model time calculation
                    logger.info("Calculating model time with values:", {
                        ageCategory: userState.ageCategory,
                        distance: userState.distance,
                        boatClass: userState.boatClass,
                        time: totalSeconds,
                        modelType: userState.modelType,
                    })

                    const modelTime =
                        userState.modelType === getMessage(chatId, "worldModel")
                            ? getModelTime(
                                  userState.ageCategory,
                                  userState.distance,
                                  userState.boatClass,
                                  totalSeconds
                              )
                            : getModelTimeRU(
                                  userState.ageCategory,
                                  userState.distance,
                                  userState.boatClass,
                                  totalSeconds
                              )

                    logger.info(`Model time calculated: ${modelTime}`)

                    // Fix percentage calculation: model time / user time * 100
                    const percentage = (
                        (modelTime / totalSeconds) *
                        100
                    ).toFixed(2)
                    logger.info(
                        `Model time calculation for ${username}: model=${modelTime}s, user=${totalSeconds}s, percentage=${percentage}%`
                    )
                    logUserAction(chatId, "calculate_model", {
                        modelTime,
                        userTime: totalSeconds,
                        percentage,
                    })

                    const response = getMessage(chatId, "timeResult")
                        .replace("{time}", text)
                        .replace("{percentage}", percentage)
                    logger.info(`Sending response: ${response}`)

                    if (userState.mode === getMessage(chatId, "createFile")) {
                        // Save result to database
                        await saveResult(chatId, {
                            name: userState.name,
                            distance: userState.distance,
                            boatClass: userState.boatClass,
                            ageCategory: userState.ageCategory,
                            time: totalSeconds,
                            modelTime,
                            percentage,
                        })

                        // Send confirmation
                        bot.sendMessage(chatId, response)

                        // Reset state and show main menu
                        initUserState(chatId)
                        const keyboard = {
                            reply_markup: {
                                keyboard: [
                                    [getMessage(chatId, "worldModel")],
                                    [getMessage(chatId, "russiaModel")],
                                ],
                                one_time_keyboard: true,
                            },
                        }
                        bot.sendMessage(
                            chatId,
                            getMessage(chatId, "selectModel"),
                            keyboard
                        )
                    } else {
                        // For single time mode, just show the result
                        bot.sendMessage(chatId, response)

                        // Reset state and show main menu
                        initUserState(chatId)
                        const keyboard = {
                            reply_markup: {
                                keyboard: [
                                    [getMessage(chatId, "worldModel")],
                                    [getMessage(chatId, "russiaModel")],
                                ],
                                one_time_keyboard: true,
                            },
                        }
                        bot.sendMessage(
                            chatId,
                            getMessage(chatId, "selectModel"),
                            keyboard
                        )
                    }
                } catch (error) {
                    logger.error(
                        `Error calculating model time for ${username}: ${error.message}`
                    )
                    logUserAction(chatId, "error", {
                        type: "model_calculation",
                        error: error.message,
                    })
                    bot.sendMessage(chatId, getMessage(chatId, "modelError"))
                }
            } else {
                logger.warn(`Invalid time format: ${text}`)
                bot.sendMessage(chatId, getMessage(chatId, "invalidTime"))
            }
            break

        case STATES.WAITING_NEXT_ACTION:
            if (text === getMessage(chatId, "enterMoreTime")) {
                userState.state = STATES.WAITING_TIME
                bot.sendMessage(
                    chatId,
                    "Введите время в формате СС.сс или ММ:СС.сс (например, 45.55 или 7:45.55)"
                )
            } else if (text === getMessage(chatId, "newName")) {
                const mode = userState.modelType
                userStates.delete(chatId)
                initUserState(chatId)
                const newState = userStates.get(chatId)
                newState.modelType = mode
                newState.state = STATES.WAITING_NAME
                bot.sendMessage(chatId, "Введите имя или фамилию:")
            } else if (text === getMessage(chatId, "finishAndGetExcel")) {
                try {
                    const files = await createExcelFile(chatId)
                    if (files) {
                        const currentSession = userSessions.get(chatId)
                        if (!currentSession) {
                            throw new Error("Session not found")
                        }

                        // Send file using absolute path
                        await bot.sendDocument(chatId, files.excelFile, {
                            filename: `results_${currentSession.username}_${currentSession.chatId}.xlsx`,
                        })
                        await bot.sendMessage(
                            chatId,
                            "Excel файл с результатами создан. Используйте /start для нового набора данных."
                        )
                        // Clean up
                        try {
                            fs.unlinkSync(files.excelFile)
                        } catch (error) {
                            logger.error(
                                `Error deleting file: ${error.message}`
                            )
                        }
                        userSessions.delete(chatId)
                        userStates.delete(chatId)
                        initUserState(chatId)
                    } else {
                        await bot.sendMessage(
                            chatId,
                            getMessage(chatId, "noDataForExcel")
                        )
                    }
                } catch (error) {
                    logger.error(
                        `Error in finish command handler: ${error.message}`,
                        error
                    )
                    logger.error(`Error stack: ${error.stack}`)
                    await bot.sendMessage(
                        chatId,
                        getMessage(chatId, "excelError")
                    )
                }
            } else if (text === getMessage(chatId, "editLastTime")) {
                const session = userSessions.get(chatId)
                if (session && session.results.length > 0) {
                    userState.state = STATES.EDITING_LAST_TIME
                    const lastResult =
                        session.results[session.results.length - 1]
                    bot.sendMessage(
                        chatId,
                        `Текущее время: ${lastResult.time}\nВведите новое время:`
                    )
                } else {
                    bot.sendMessage(chatId, getMessage(chatId, "noResults"))
                }
            } else if (text === getMessage(chatId, "viewHistory")) {
                userState.state = STATES.VIEWING_HISTORY
                const session = userSessions.get(chatId)
                if (session && session.results.length > 0) {
                    const history = session.results
                        .map(
                            (r, i) =>
                                `${i + 1}. ${r.name} - ${r.time} (${
                                    r.modelPercentage
                                }%)`
                        )
                        .join("\n")
                    bot.sendMessage(chatId, `История результатов:\n${history}`)
                } else {
                    bot.sendMessage(chatId, getMessage(chatId, "historyEmpty"))
                }
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "invalidAction"))
            }
            break

        case STATES.EDITING_LAST_TIME:
            // Handle time editing similar to WAITING_TIME state
            // ... existing time validation code ...
            const session = userSessions.get(chatId)
            if (session && session.results.length > 0) {
                session.results[session.results.length - 1].time = text
                // Recalculate model percentage
                // ... existing calculation code ...
                bot.sendMessage(chatId, getMessage(chatId, "timeUpdated"))
                userState.state = STATES.WAITING_NEXT_ACTION
                const keyboard = {
                    reply_markup: {
                        keyboard: [
                            [getMessage(chatId, "enterMoreTime")],
                            [getMessage(chatId, "newName")],
                            [getMessage(chatId, "finishAndGetExcel")],
                            [getMessage(chatId, "editLastTime")],
                            [getMessage(chatId, "viewHistory")],
                        ],
                        one_time_keyboard: true,
                    },
                }
                addCancelButton(keyboard)
                bot.sendMessage(chatId, "Выберите действие:", keyboard)
            }
            break
    }
})
