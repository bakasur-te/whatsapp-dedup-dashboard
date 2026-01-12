const fs = require('fs');
const path = require('path');
const { statements, dataDir } = require('./database');

function runCleanup() {
    console.log('[Retention] Starting cleanup...');
    const deleteResult = statements.deleteOldGroupMessages.run();
    console.log(`[Retention] Deleted ${deleteResult.changes} old group/community messages`);

    const orphanedMedia = statements.getOrphanedMedia.all();
    let deletedMediaCount = 0;

    for (const media of orphanedMedia) {
        if (media.file_path) {
            const fullPath = path.join(dataDir, media.file_path);
            try {
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch (err) {
                console.error(`[Retention] Failed to delete: ${fullPath}`, err.message);
            }
        }
        statements.deleteMedia.run(media.id);
        deletedMediaCount++;
    }
    console.log(`[Retention] Deleted ${deletedMediaCount} orphaned media files`);
}

function scheduleCleanup() {
    runCleanup();
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
        runCleanup();
        setInterval(runCleanup, 24 * 60 * 60 * 1000);
    }, msUntilMidnight);

    console.log(`[Retention] Scheduled daily cleanup at midnight`);
}

module.exports = { runCleanup, scheduleCleanup };
