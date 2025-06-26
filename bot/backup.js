const fs = require("fs");
const path = require("path");

const BACKUP_DIR = "backups";
const BACKUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 часа

// Функция создания резервной копии
async function createBackup(userSessions, userStates, userSettings, logger) {
    try {
        if (!fs.existsSync(BACKUP_DIR)) {
            logger && logger.warn(`Backup directory ${BACKUP_DIR} does not exist, skipping backup`);
            return;
        }
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const backupData = {
            timestamp,
            userSessions: Array.from(userSessions.entries()),
            userStates: Array.from(userStates.entries()),
            userSettings: Array.from(userSettings.entries()),
        };
        const backupFile = `${BACKUP_DIR}/backup_${timestamp}.json`;
        await fs.promises.writeFile(
            backupFile,
            JSON.stringify(backupData, null, 2)
        );
        logger && logger.info(`Backup created: ${backupFile}`);
        // Clean up old backups (keep last 7 days)
        try {
            const files = await fs.promises.readdir(BACKUP_DIR);
            const oldFiles = files.filter((file) => {
                const filePath = `${BACKUP_DIR}/${file}`;
                const stats = fs.statSync(filePath);
                const fileAge = Date.now() - stats.mtime.getTime();
                return fileAge > 7 * 24 * 60 * 60 * 1000; // 7 дней
            });
            for (const file of oldFiles) {
                await fs.promises.unlink(`${BACKUP_DIR}/${file}`);
                logger && logger.info(`Old backup deleted: ${file}`);
            }
        } catch (cleanupError) {
            logger && logger.warn(`Could not cleanup old backups: ${cleanupError.message}`);
        }
    } catch (error) {
        logger && logger.warn(`Could not create backup: ${error.message}`);
    }
}

// Функция восстановления из резервной копии
async function restoreFromBackup(backupFile, userSessions, userStates, userSettings, logger) {
    try {
        const backupData = JSON.parse(
            await fs.promises.readFile(backupFile, "utf8")
        );
        userSessions.clear();
        userStates.clear();
        userSettings.clear();
        backupData.userSessions.forEach(([key, value]) =>
            userSessions.set(key, value)
        );
        backupData.userStates.forEach(([key, value]) =>
            userStates.set(key, value)
        );
        backupData.userSettings.forEach(([key, value]) =>
            userSettings.set(key, value)
        );
        logger && logger.info(`Data restored from backup: ${backupFile}`);
        return true;
    } catch (error) {
        logger && logger.error(`Error restoring from backup: ${error.message}`, error);
        return false;
    }
}

module.exports = {
    createBackup,
    restoreFromBackup,
    BACKUP_DIR,
    BACKUP_INTERVAL,
}; 