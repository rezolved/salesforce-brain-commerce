const Logger = require('dw/system/Logger');
const Status = require('dw/system/Status');
const CustomObjectMgr = require('dw/object/CustomObjectMgr');
const Transaction = require('dw/system/Transaction');

/**
 * Task status constants for API currentStage values
 * These are the statuses returned by the Rezolve SNPD API
 */
const TASK_CURRENT_STAGE = {
    INITIATED: 'INITIATED',
    QUEUED: 'QUEUED',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETE: 'COMPLETE',
    FAILED: 'FAILED'
};

/**
 * Task status constants for custom object status values
 * These are the statuses stored in the rezolveIngestionTask custom object
 */
const TASK_STATUS = {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    CANCELED: 'CANCELED',
    TIMED_OUT: 'TIMED_OUT'
};

/**
 * Converts a time string in HH:MM:SS format to total seconds
 * @param {string} timeString - Time in HH:MM:SS format (e.g., "00:32:16")
 * @returns {number} Total seconds, or 0 if parsing fails
 */
function convertDurationToSeconds(timeString) {
    try {
        if (!timeString || typeof timeString !== 'string') {
            return 0;
        }

        const parts = timeString.split(':');
        if (parts.length !== 3) {
            return 0;
        }

        const hours = parseInt(parts[0], 10) || 0;
        const minutes = parseInt(parts[1], 10) || 0;
        const seconds = parseInt(parts[2], 10) || 0;

        return (hours * 3600) + (minutes * 60) + seconds;
    } catch (error) {
        Logger.error('Error converting duration to seconds: {0}', error.message);
        return 0;
    }
}

/**
 * Fetches rezolveIngestionTask custom objects with status PENDING or IN_PROGRESS.
 * @returns {dw.object.CustomObjectIterator} Iterator of matching custom objects, or null if an error occurs.
 */
function getActiveTasks() {
    try {
        return CustomObjectMgr.queryCustomObjects(
            'rezolveIngestionTask',
            'custom.status = {0} OR custom.status = {1}',
            'creationDate desc',
            'PENDING',
            'IN_PROGRESS'
        );
    } catch (error) {
        Logger.error('Error querying rezolveIngestionTask custom objects: {0}', error.message);
        return null;
    }
}

/**
 * Updates the status of a task in the custom object
 * @param {Object} task - The task custom object to update
 * @param {string} status - The new status to set
 * @param {boolean} isCompleted - Whether the task is completed (sets completedAt if true)
 * @param {string} currentStage - Optional current stage value to set
 * @param {Object} apiMetrics - Optional object containing API processing metrics
 */
function updateTaskStatus(task, status, isCompleted, currentStage, apiMetrics) {
    try {
        Transaction.wrap(function () {
            task.custom.status = status;
            task.custom.lastCheckedAt = new Date();

            if (isCompleted) {
                task.custom.completedAt = new Date();
            }

            if (currentStage) {
                task.custom.currentStage = currentStage;
            }

            if (apiMetrics) {
                if (typeof apiMetrics.ingestionProcessingTimeSec !== 'undefined') {
                    task.custom.ingestionProcessingTimeSec = apiMetrics.ingestionProcessingTimeSec;
                }
                if (typeof apiMetrics.numProcessedRecords !== 'undefined') {
                    task.custom.numProcessedRecords = apiMetrics.numProcessedRecords;
                }
                if (typeof apiMetrics.numIndexedDocuments !== 'undefined') {
                    task.custom.numIndexedDocuments = apiMetrics.numIndexedDocuments;
                }
                if (typeof apiMetrics.numFailedRecords !== 'undefined') {
                    task.custom.numFailedRecords = apiMetrics.numFailedRecords;
                }

                Logger.info(
                    'Task {0} status updated to {1} with metrics: processingTime={2}s, processed={3}, indexed={4}, failed={5}',
                    task.custom.taskID,
                    status,
                    apiMetrics.ingestionProcessingTimeSec || 0,
                    apiMetrics.numProcessedRecords || 0,
                    apiMetrics.numIndexedDocuments || 0,
                    apiMetrics.numFailedRecords || 0
                );
            } else {
                Logger.info('Task {0} status updated to {1}', task.custom.taskID, status);
            }
        });
    } catch (error) {
        Logger.error('Error updating task {0} status to {1}: {2}', task.custom.taskID, status, error.message);
    }
}

/**
 * Poll and update job function.
 * @returns {Status} Status object indicating job completion
 */
function pollAndUpdate() {
    try {
        const rzlvSnpdService = require('*/cartridge/scripts/services/rezolveSnpdService');
        const activeTasks = getActiveTasks();
        const currentTime = new Date();
        const twentyFourHoursInMs = 24 * 60 * 60 * 1000;

        if (!activeTasks) {
            Logger.info('No pending tasks found');
            return new Status(Status.OK, 'NO_TASKS');
        }
        const tasksArray = [];
        while (activeTasks.hasNext()) {
            tasksArray.push(activeTasks.next());
        }
        activeTasks.close();

        tasksArray.forEach(function (task) {
            if (task.lastModified) {
                const timeDifference = currentTime.getTime() - new Date(task.lastModified).getTime();

                if (timeDifference > twentyFourHoursInMs) {
                    const hoursPassed = Math.floor(timeDifference / (60 * 60 * 1000));
                    updateTaskStatus(
                        task,
                        TASK_STATUS.TIMED_OUT,
                        true
                    );
                    Logger.warn(
                        'Task {0} has not been updated for more than 24 hours. '
            + '{1} hours have passed since last modification. Task status changed to TIMED_OUT.',
                        task.custom.taskID,
                        hoursPassed
                    );
                } else {
                    try {
                        const taskDetails = rzlvSnpdService.getTaskDetail(task.custom.taskID, false);
                        if (taskDetails && taskDetails.success) {
                            Logger.error('Current task status: {0}', taskDetails.data.currentStage);

                            let apiMetrics = null;
                            if (taskDetails.data.currentStage === TASK_CURRENT_STAGE.COMPLETE
                || taskDetails.data.currentStage === TASK_CURRENT_STAGE.FAILED) {
                                apiMetrics = {};

                                if (taskDetails.data.processing) {
                                    const processing = taskDetails.data.processing;

                                    if (processing.indexingDuration) {
                                        apiMetrics.ingestionProcessingTimeSec = convertDurationToSeconds(
                                            processing.indexingDuration
                                        );
                                    } else {
                                        apiMetrics.ingestionProcessingTimeSec = 0;
                                    }

                                    apiMetrics.numProcessedRecords = processing.numProcessedRecords || 0;
                                    apiMetrics.numIndexedDocuments = processing.numIndexedDocuments || 0;
                                    apiMetrics.numFailedRecords = processing.numFailedRecords || 0;
                                } else {
                                    apiMetrics.ingestionProcessingTimeSec = 0;
                                    apiMetrics.numProcessedRecords = 0;
                                    apiMetrics.numIndexedDocuments = 0;
                                    apiMetrics.numFailedRecords = 0;
                                }
                            }

                            switch (taskDetails.data.currentStage) {
                                case TASK_CURRENT_STAGE.COMPLETE:
                                    updateTaskStatus(
                                        task,
                                        TASK_STATUS.SUCCESS,
                                        true,
                                        taskDetails.data.currentStage,
                                        apiMetrics
                                    );
                                    break;
                                case TASK_CURRENT_STAGE.FAILED:
                                    updateTaskStatus(
                                        task,
                                        TASK_STATUS.FAILED,
                                        true,
                                        taskDetails.data.currentStage,
                                        apiMetrics
                                    );
                                    break;
                                default:
                                    updateTaskStatus(
                                        task,
                                        TASK_STATUS.IN_PROGRESS,
                                        false,
                                        taskDetails.data.currentStage
                                    );
                            }
                        } else {
                            Logger.error('Failed to get task details for {0}: {1}', task.custom.taskID, taskDetails ? taskDetails.message : 'Unknown error');
                        }
                    } catch (error) {
                        Logger.error('Error getting task details for {0}: {1}', task.custom.taskID, error.message);
                    }
                }
            }
        });
        return new Status(Status.OK, 'COMPLETED');
    } catch (error) {
        Logger.error('Error in pollAndUpdate: {0}', error.message);
        return new Status(Status.ERROR, 'FAILED');
    }
}

module.exports = {
    pollAndUpdate: pollAndUpdate
};
