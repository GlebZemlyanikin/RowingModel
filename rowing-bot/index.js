require("dotenv").config()
const TelegramBot = require("node-telegram-bot-api")
const express = require("express")
const { getModelTime, modelTimesWORLD } = require("../../shared/modelTableWORLD")
const { getModelTime: getModelTimeRU, modelTimesRUSSIA } = require("../../shared/modelTableRUSSIA")
const { distances, getDistance } = require("../../shared/distanceTable")
const winston = require("winston")
const fs = require("fs")
const ExcelJS = require("exceljs")
const path = require("path")
const { parseTimeToSeconds, formatTime, avg, calculateModelPercentage } = require("../../shared/utils")
const { createExcelFile } = require("./excel")
const { createBackup, restoreFromBackup, BACKUP_DIR, BACKUP_INTERVAL } = require("./backup")

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

// Polling configuration
let isPolling = false
let retryCount = 0
const MAX_RETRIES = 5
const BASE_DELAY = 1000 // 1 second
const RESTART_DELAY = 2000 // 2 seconds between stop and start

async function startPolling() {
    if (isPolling) {
        logger.info("Polling is already running, skipping start")
        return
    }

    try {
        isPolling = true
        await bot.startPolling()
        logger.info("Polling started successfully")
        retryCount = 0
    } catch (error) {
        logger.error(`Error starting polling: ${error.message}`)
        isPolling = false
        throw error
    }
}

async function stopPolling() {
    if (!isPolling) {
        logger.info("Polling is not running, skipping stop")
        return
    }

    try {
        await bot.stopPolling()
        logger.info("Polling stopped successfully")
        isPolling = false
    } catch (error) {
        logger.error(`Error stopping polling: ${error.message}`)
        throw error
    }
}

async function restartPolling() {
    try {
        await stopPolling()
        // Wait for a moment to ensure all connections are closed
        await new Promise((resolve) => setTimeout(resolve, RESTART_DELAY))
        await startPolling()
    } catch (error) {
        logger.error(`Error during polling restart: ${error.message}`)
        throw error
    }
}

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: {
        interval: 300,
        autoStart: false, // We'll start polling manually
        params: {
            timeout: 10,
        },
    },
})

// Polling error handling with exponential backoff
bot.on("polling_error", async (error) => {
    if (error.code === "ETELEGRAM" && error.response.statusCode === 409) {
        logger.warn(
            `Polling conflict detected. Retry attempt ${
                retryCount + 1
            }/${MAX_RETRIES}`
        )

        if (retryCount < MAX_RETRIES) {
            const delay = BASE_DELAY * Math.pow(2, retryCount)
            retryCount++

            logger.info(`Waiting ${delay}ms before retrying...`)

            try {
                // Wait for the initial delay
                await new Promise((resolve) => setTimeout(resolve, delay))
                // Then restart polling
                await restartPolling()
            } catch (err) {
                logger.error(`Error during polling restart: ${err.message}`)
                if (retryCount >= MAX_RETRIES) {
                    logger.error("Max retry attempts reached. Stopping bot.")
                    process.exit(1)
                }
            }
        } else {
            logger.error("Max retry attempts reached. Stopping bot.")
            await stopPolling()
            process.exit(1)
        }
    } else {
        logger.error("Polling error:", error)
    }
})

// Start polling when bot is ready
bot.on("polling_success", () => {
    if (retryCount > 0) {
        logger.info("Polling recovered successfully")
        retryCount = 0
    }
})

// Initialize bot
async function initializeBot() {
    try {
        // Ensure polling is stopped before starting
        await stopPolling()
        // Start polling
        await startPolling()
        logger.info("Bot initialized successfully")
    } catch (error) {
        logger.error(`Failed to initialize bot: ${error.message}`)
        process.exit(1)
    }
}

// Start the bot
initializeBot()

logger.info("Bot instance created")

// User states storage
const userStates = new Map()
logger.info("User states storage initialized")

// Create necessary directories (optional for Railway)
const dirs = ["sessions", "backups"]
dirs.forEach((dir) => {
    try {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true })
            logger.info(`Created directory: ${dir}`)
        }
    } catch (error) {
        logger.warn(
            `Could not create directory ${dir}: ${error.message}. Continuing without it.`
        )
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
    try {
        const session = userSessions.get(chatId)
        if (session) {
            const filename = `sessions/${session.username}_${
                session.chatId
            }_${session.startTime.replace(/[:.]/g, "-")}.json`
            fs.writeFileSync(filename, JSON.stringify(session, null, 2))
        }
    } catch (error) {
        logger.warn(
            `Could not save session for chatId ${chatId}: ${error.message}`
        )
    }
}

// Save result to session
async function saveResult(chatId, result) {
    try {
        let session = userSessions.get(chatId)

        // If session doesn't exist, create a new one
        if (!session) {
            logger.warn(
                `Session not found for chatId ${chatId}, creating new session`
            )
            const username = `User_${chatId}` // Default username if not available
            initUserSession(chatId, username)
            session = userSessions.get(chatId)
        }

        // Format time for display
        const formattedTime = formatTime(result.time)

        // Add result to session, ensuring modelType is saved
        session.results.push({
            name: result.name,
            distance: result.distance,
            boatClass: result.boatClass,
            ageCategory: result.ageCategory,
            time: formattedTime,
            modelTime: result.modelTime,
            modelPercentage: result.percentage,
            modelType: result.modelType, // Explicitly save modelType
            timestamp: new Date().toISOString(),
        })

        logger.info(`Result saved for user ${session.username}:`, {
            name: result.name,
            time: formattedTime,
            percentage: result.percentage,
        })

        // Save session to file
        saveSession(chatId)

        return true
    } catch (error) {
        logger.error(`Error saving result: ${error.message}`, error)
        throw error
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
        logger.warn(`Could not create backup: ${error.message}`)
        bot.sendMessage(
            chatId,
            "Резервная копия не создана (функция недоступна)"
        )
    }
})

// Add restore command
bot.onText(/\/restore/, async (msg) => {
    const chatId = msg.chat.id
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            bot.sendMessage(chatId, "Резервные копии недоступны")
            return
        }

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
        logger.warn(`Could not restore from backup: ${error.message}`)
        bot.sendMessage(chatId, "Восстановление недоступно")
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
            // More flexible text matching for mobile devices
            const modeText = text.trim()

            // Check if user accidentally sent an age category
            const allAgeCategories = [
                ...worldAgeCategories,
                ...russiaAgeCategories,
            ]
            const isAgeCategory = allAgeCategories.some(
                (cat) =>
                    modeText.includes(cat) ||
                    getMessage(chatId, cat) === modeText
            )

            if (isAgeCategory) {
                logger.warn(
                    `User ${username} sent age category "${text}" in WAITING_MODE state, redirecting to age selection`
                )
                userState.state = STATES.WAITING_AGE
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
                return
            }

            if (
                modeText.includes("Создать файл") ||
                modeText.includes("Create results file") ||
                modeText.includes("createFile")
            ) {
                userState.mode = getMessage(chatId, "createFile")
                userState.state = STATES.WAITING_NAME
                logger.info(`User ${username} selected mode: ${userState.mode}`)
                logUserAction(chatId, "select_mode", { mode: userState.mode })
                bot.sendMessage(chatId, getMessage(chatId, "enterName"))
            } else if (
                modeText.includes("Ввести одно время") ||
                modeText.includes("Enter single time") ||
                modeText.includes("singleTime")
            ) {
                userState.mode = getMessage(chatId, "singleTime")
                userState.state = STATES.WAITING_AGE
                logger.info(`User ${username} selected mode: ${userState.mode}`)
                logUserAction(chatId, "select_mode", { mode: userState.mode })

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
            } else {
                logger.warn(
                    `Invalid mode selection: "${text}" from user ${username}`
                )
                // Show the mode selection keyboard again
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
            // More flexible text matching for age categories
            const ageText = text.trim()
            const ageCategories =
                userState.modelType === getMessage(chatId, "worldModel")
                    ? worldAgeCategories
                    : russiaAgeCategories

            const selectedCategory = ageCategories.find(
                (cat) =>
                    getMessage(chatId, cat) === ageText ||
                    cat === ageText ||
                    ageText.includes(cat)
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
                logger.warn(
                    `Invalid age category: "${text}" from user ${username}`
                )
                bot.sendMessage(chatId, getMessage(chatId, "invalidAge"))
            }
            break

        case STATES.WAITING_DISTANCE:
            // More flexible text matching for distances
            const distanceText = text.trim()
            const selectedDistance = distances.find(
                (dist) =>
                    getMessage(chatId, dist) === distanceText ||
                    dist === distanceText
            )

            logger.info(`DEBUG: User input for distance: '${text}', selectedDistance: '${selectedDistance}'`)

            if (selectedDistance) {
                const parsedDistance = getDistance(selectedDistance)
                logger.info(`DEBUG: getDistance('${selectedDistance}') = ${parsedDistance}`)
                userState.distance = parsedDistance
                userState.state = STATES.WAITING_BOAT
                logger.info(
                    `User ${username} selected distance: ${selectedDistance} (parsed: ${parsedDistance})`
                )
                logUserAction(chatId, "select_distance", {
                    distance: selectedDistance,
                    parsedDistance,
                })

                const keyboard = getTranslatedKeyboard(chatId, boatClasses)
                bot.sendMessage(
                    chatId,
                    getMessage(chatId, "selectBoat"),
                    keyboard
                )
            } else {
                logger.warn(`Invalid distance: \"${text}\" from user ${username}`)
                bot.sendMessage(chatId, getMessage(chatId, "invalidDistance"))
            }
            break

        case STATES.WAITING_BOAT:
            // More flexible text matching for boat classes
            const boatText = text.trim()
            const selectedBoat = boatClasses.find(
                (boat) =>
                    getMessage(chatId, boat) === boatText ||
                    boat === boatText ||
                    boatText.includes(boat)
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
                logger.warn(
                    `Invalid boat class: "${text}" from user ${username}`
                )
                bot.sendMessage(chatId, getMessage(chatId, "invalidBoat"))
            }
            break

        case STATES.WAITING_TIME:
            logger.info(`Processing time input: ${text}`)

            // Use the parseTimeToSeconds function for consistent time parsing
            const totalSeconds = parseTimeToSeconds(text)

            if (totalSeconds > 0) {
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

                    // Get base model time for 2000m for correct percentage calculation
                    const baseModelTime = userState.modelType === getMessage(chatId, "worldModel")
                            ? modelTimesWORLD[userState.ageCategory]?.[userState.boatClass]
                            : modelTimesRUSSIA[userState.ageCategory]?.[userState.boatClass];
                    
                    // Calculate model percentage based on average speed
                    const percentage = calculateModelPercentage(
                        baseModelTime,
                        userState.distance,
                        totalSeconds
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
                        try {
                            // Save result to database
                            await saveResult(chatId, {
                                name: userState.name,
                                distance: userState.distance,
                                boatClass: userState.boatClass,
                                ageCategory: userState.ageCategory,
                                time: totalSeconds,
                                modelTime,
                                percentage,
                                modelType: userState.modelType,
                            })

                            // Send confirmation
                            bot.sendMessage(chatId, response)

                            // Show next action menu instead of resetting state
                            userState.state = STATES.WAITING_NEXT_ACTION
                            const keyboard = {
                                reply_markup: {
                                    keyboard: [
                                        [getMessage(chatId, "enterMoreTime")],
                                        [getMessage(chatId, "newName")],
                                        [
                                            getMessage(
                                                chatId,
                                                "finishAndGetExcel"
                                            ),
                                        ],
                                        [getMessage(chatId, "editLastTime")],
                                    ],
                                    one_time_keyboard: true,
                                },
                            }
                            addCancelButton(keyboard)
                            bot.sendMessage(
                                chatId,
                                getMessage(chatId, "selectAction"),
                                keyboard
                            )
                        } catch (saveError) {
                            logger.error(
                                `Error saving result: ${saveError.message}`
                            )
                            // Still show the result to user, but don't save
                            bot.sendMessage(chatId, response)
                            bot.sendMessage(
                                chatId,
                                "Результат показан, но не сохранен из-за технической ошибки. Попробуйте еще раз."
                            )

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
                const mode = userState.mode
                const modelType = userState.modelType
                userStates.delete(chatId)
                initUserState(chatId)
                const newState = userStates.get(chatId)
                newState.modelType = modelType
                newState.mode = mode
                newState.state = STATES.WAITING_NAME
                bot.sendMessage(chatId, "Введите имя или фамилию:")
            } else if (text === getMessage(chatId, "finishAndGetExcel")) {
                try {
                    const currentSession = userSessions.get(chatId);
                    const files = await createExcelFile(chatId, currentSession, getMessage);
                    if (files) {
                        // Send file using absolute path
                        await bot.sendDocument(chatId, files.excelFile, {
                            filename: `results_${currentSession.username}_${currentSession.chatId}.xlsx`,
                            contentType:
                                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "invalidAction"))
            }
            break

        case STATES.EDITING_LAST_TIME:
            // Handle time editing similar to WAITING_TIME state
            const session = userSessions.get(chatId)
            if (session && session.results.length > 0) {
                const lastResult = session.results[session.results.length - 1]
                const newTimeSeconds = parseTimeToSeconds(text)

                if (newTimeSeconds > 0) {
                    // Use the result's modelType for correct recalculation
                    const modelTable = lastResult.modelType === getMessage(chatId, "worldModel") ? modelTimesWORLD : modelTimesRUSSIA;
                    const baseModelTime = modelTable[lastResult.ageCategory]?.[lastResult.boatClass];
                    
                    const newPercentage = baseModelTime ? calculateModelPercentage(baseModelTime, lastResult.distance, newTimeSeconds).toFixed(2) : "0.00";

                    lastResult.time = formatTime(newTimeSeconds)
                    lastResult.modelPercentage = newPercentage

                    bot.sendMessage(chatId, getMessage(chatId, "timeUpdated"))
                    userState.state = STATES.WAITING_NEXT_ACTION
                    const keyboard = {
                        reply_markup: {
                            keyboard: [
                                [getMessage(chatId, "enterMoreTime")],
                                [getMessage(chatId, "newName")],
                                [getMessage(chatId, "finishAndGetExcel")],
                                [getMessage(chatId, "editLastTime")],
                            ],
                            one_time_keyboard: true,
                        },
                    }
                    addCancelButton(keyboard)
                    bot.sendMessage(chatId, "Выберите действие:", keyboard)
                } else {
                    bot.sendMessage(chatId, getMessage(chatId, "invalidTime"))
                }
            } else {
                bot.sendMessage(chatId, getMessage(chatId, "noResults"))
            }
            break
    }
})

const WEB_URL = 'rowingmodel-production.up.railway.app'; // Замените на реальный адрес после деплоя

// Команда /web
bot.onText(/\/web/, (msg) => {
    bot.sendMessage(msg.chat.id, `Веб-версия калькулятора: ${WEB_URL}`);
});

// Кнопка в /start
bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, 'Добро пожаловать! Выберите действие:', {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Открыть веб-калькулятор', url: WEB_URL }]
            ]
        }
    });
});
